import { RecommendedBuild } from "./recommended-build";

export type ClientRuneInput = {
    primaryStyleId: number;
    subStyleId: number;
    // Keystone, 3 primary, 2 secondary, 3 shards.
    perkIds: number[];
};

export type ClientItemInput = {
    startingItems: number[];
    boots?: number;
    coreItems: number[];
};

/**
 * Plain ids for the two client writes (rune page, item set). A part is left
 * out when the build cannot fill it: the rune page needs all nine ids, the
 * item set needs at least one item. The Rust side validates again.
 */
export function toClientImportInputs(build: RecommendedBuild): {
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

    const startingItems = build.startingItems?.choice.value ?? [];
    const boots = build.boots?.choice.value;
    const coreItems = build.coreItems.map((slot) => slot.choice.value);
    if (
        startingItems.length > 0 ||
        boots !== undefined ||
        coreItems.length > 0
    ) {
        result.items = { startingItems, boots, coreItems };
    }

    return result;
}
