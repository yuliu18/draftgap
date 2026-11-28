import { RecommendedBuild } from "./recommended-build";
import { DamageFocus, SituationalItems } from "./situational-items";

const unique = (ids: number[]) => [...new Set(ids)];

export type ClientRuneInput = {
    primaryStyleId: number;
    subStyleId: number;
    // Keystone, 3 primary, 2 secondary, 3 shards.
    perkIds: number[];
};

export type ClientItemBlockKind =
    | "start"
    | "boots"
    | "core"
    | "alternatives"
    | "armor"
    | "magicResist";

// One block of the client's item set. The title is chosen by the caller.
export type ClientItemBlock = { kind: ClientItemBlockKind; items: number[] };

export type ClientItemInput = { blocks: ClientItemBlock[] };

export type ClientSituationalInput = SituationalItems & { focus: DamageFocus };

/**
 * Plain ids for the two client writes (rune page, item set). A part is left
 * out when the build cannot fill it: the rune page needs all nine ids, the
 * item set needs at least one item of the build itself. The Rust side
 * validates again.
 */
export function toClientImportInputs(
    build: RecommendedBuild,
    situational?: ClientSituationalInput,
): {
    runes?: ClientRuneInput;
    items?: ClientItemInput;
} {
    const result: { runes?: ClientRuneInput; items?: ClientItemInput } = {};

    const r = build.runes;
    if (r) {
        const perkIds = [...r.primary, ...r.secondary, ...r.shards].map(
            (slot) => slot.choice.value,
        );
        const isId = (n: number) => Number.isInteger(n) && n > 0;
        if (
            r.primary.length === 4 &&
            r.secondary.length === 2 &&
            r.shards.length === 3 &&
            isId(r.primaryPathId) &&
            isId(r.secondaryPathId) &&
            perkIds.every(isId)
        ) {
            result.runes = {
                primaryStyleId: r.primaryPathId,
                subStyleId: r.secondaryPathId,
                perkIds,
            };
        }
    }

    // Starting items keep their repeats (two potions); the other blocks list
    // each item once.
    const startingItems = build.startingItems?.choice.value ?? [];
    const boots = build.boots
        ? unique([
              build.boots.choice.value,
              ...build.boots.alternatives.map((c) => c.value),
          ])
        : [];
    const coreItems = unique(build.coreItems.map((slot) => slot.choice.value));
    const alternatives = unique(
        build.coreItems.flatMap((slot) =>
            slot.alternatives.map((c) => c.value),
        ),
    ).filter((id) => !coreItems.includes(id));

    const blocks: ClientItemBlock[] = [
        { kind: "start", items: startingItems },
        { kind: "boots", items: boots },
        { kind: "core", items: coreItems },
        { kind: "alternatives", items: alternatives },
    ];
    // Situational options only extend a build, they are not one on their own.
    if (blocks.some((b) => b.items.length > 0) && situational) {
        // An item the set already lists is not repeated as a situational one.
        const listed = new Set([...boots, ...coreItems, ...alternatives]);
        const fresh = (choices: { value: number }[]) =>
            choices.map((c) => c.value).filter((id) => !listed.has(id));
        const armor: ClientItemBlock = {
            kind: "armor",
            items: fresh(situational.armor),
        };
        const magicResist: ClientItemBlock = {
            kind: "magicResist",
            items: fresh(situational.magicResist),
        };
        blocks.push(
            ...(situational.focus === "magic"
                ? [magicResist, armor]
                : [armor, magicResist]),
        );
    }
    const filled = blocks.filter((b) => b.items.length > 0);
    if (filled.length > 0) result.items = { blocks: filled };

    return result;
}
