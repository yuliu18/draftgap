/**
 * Defensive options against the enemy team. The build page has no statistics
 * by enemy composition, so the options are the champion's own item rows
 * (every buying order) that Data Dragon tags as armor or magic resist, and the
 * enemy team's damage profile only decides which of the two is shown first.
 */

export type ItemDefenseTags = Record<
    number,
    { armor: boolean; magicResist: boolean }
>;

export type SituationalChoice = {
    value: number;
    wins: number;
    games: number;
    rawWinrate: number;
};

export type DamageFocus = "magic" | "physical" | "mixed" | "unknown";

export type SituationalItems = {
    armor: SituationalChoice[];
    magicResist: SituationalChoice[];
};

// An item must be built in at least 1% of the champion's games to be offered.
export const SITUATIONAL_MIN_GAME_SHARE = 0.01;
export const SITUATIONAL_OPTIONS = 3;
// Share of the enemy's magic + physical damage that makes it the focus.
export const DAMAGE_FOCUS_SHARE = 0.6;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

/** Data Dragon `item.json` -> the items tagged Armor or SpellBlock. */
export function mapItemDefenseTags(json: unknown): ItemDefenseTags {
    const result: ItemDefenseTags = {};
    const data = isRecord(json) && isRecord(json.data) ? json.data : {};
    for (const [key, entry] of Object.entries(data)) {
        if (!/^\d+$/.test(key) || !isRecord(entry)) continue;
        const tags = Array.isArray(entry.tags) ? entry.tags : [];
        const armor = tags.includes("Armor");
        const magicResist = tags.includes("SpellBlock");
        if (armor || magicResist) result[Number(key)] = { armor, magicResist };
    }
    return result;
}

export function enemyDamageFocus(
    damage: { magic: number; physical: number; true: number } | undefined,
): { focus: DamageFocus; magicShare: number | undefined } {
    const total = (damage?.magic ?? 0) + (damage?.physical ?? 0);
    if (!damage || !(total > 0)) {
        return { focus: "unknown", magicShare: undefined };
    }
    const magicShare = damage.magic / total;
    const focus =
        magicShare >= DAMAGE_FOCUS_SHARE
            ? "magic"
            : 1 - magicShare >= DAMAGE_FOCUS_SHARE
              ? "physical"
              : "mixed";
    return { focus, magicShare };
}

export function situationalItems(
    statsByOrder: Record<string, { wins: number; games: number }>[] | undefined,
    championGames: number,
    tags: ItemDefenseTags,
    skip: { exclude: readonly number[]; boots: readonly number[] },
): SituationalItems {
    const result: SituationalItems = { armor: [], magicResist: [] };
    if (!(championGames > 0)) return result;

    const skipped = new Set([...skip.exclude, ...skip.boots]);
    const pooled = new Map<number, { wins: number; games: number }>();
    for (const order of statsByOrder ?? []) {
        for (const [key, stats] of Object.entries(order)) {
            const id = parseInt(key);
            if (Number.isNaN(id) || skipped.has(id) || !tags[id]) continue;
            if (!(stats.games > 0)) continue;
            const sum = pooled.get(id) ?? { wins: 0, games: 0 };
            sum.wins += stats.wins;
            sum.games += stats.games;
            pooled.set(id, sum);
        }
    }

    const choices = [...pooled.entries()]
        .filter(
            ([, stats]) =>
                stats.games / championGames >= SITUATIONAL_MIN_GAME_SHARE,
        )
        .sort(([a, x], [b, y]) => y.games - x.games || a - b)
        .map(([value, stats]) => ({
            value,
            wins: stats.wins,
            games: stats.games,
            rawWinrate: stats.wins / stats.games,
        }));

    result.armor = choices
        .filter((c) => tags[c.value].armor)
        .slice(0, SITUATIONAL_OPTIONS);
    result.magicResist = choices
        .filter((c) => tags[c.value].magicResist)
        .slice(0, SITUATIONAL_OPTIONS);
    return result;
}
