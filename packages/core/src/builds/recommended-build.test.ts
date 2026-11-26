import { describe, expect, test } from "bun:test";
import {
    FullBuildDataset,
    PartialBuildDataset,
} from "../models/build/BuildDataset";
import { Dataset } from "../models/dataset/Dataset";
import { analyzeBuild } from "./analysis";
import { RecommendedBuild, recommendBuild } from "./recommended-build";

type Stats = { wins: number; games: number };
const s = (wins: number, games: number): Stats => ({ wins, games });

// Rune id = path * 100 + row * 10 + index. Paths 1, 2 and 3; row 0 is the
// keystone row. Shard ids 5001-5003 offense, 5011-5013 flex, 5021-5023 defense.
const PATHS = [1, 2, 3];
const dataset = {
    version: "test",
    date: "",
    championData: {},
    itemData: {},
    summonerSpellData: {},
    runePathData: {},
    runeData: Object.fromEntries(
        PATHS.flatMap((pathId) =>
            [0, 1, 2, 3].flatMap((slot) =>
                [0, 1, 2].map((index) => {
                    const id = pathId * 100 + slot * 10 + index;
                    return [
                        id,
                        {
                            id,
                            key: "",
                            name: "",
                            icon: "",
                            pathId,
                            slot,
                            index,
                        },
                    ];
                }),
            ),
        ),
    ),
    statShardData: Object.fromEntries(
        [0, 1, 2].flatMap((slot) =>
            [0, 1, 2].map((index) => {
                const id = 5000 + slot * 10 + index + 1;
                return [
                    id,
                    { id, key: "", name: "", positions: [{ slot, index }] },
                ];
            }),
        ),
    ),
} as unknown as Dataset;

// Every rune of the given paths played `games` games with a 50% win rate,
// except for overrides.
function runeStats(
    pathIds: number[],
    slots: number[],
    overrides: Record<number, Stats> = {},
) {
    const out: Record<string, Stats> = {};
    for (const pathId of pathIds) {
        for (const slot of slots) {
            for (const index of [0, 1, 2]) {
                const id = pathId * 100 + slot * 10 + index;
                out[id] = overrides[id] ?? s(100, 200);
            }
        }
    }
    return out;
}

function shardStats(overrides: Record<number, Stats> = {}) {
    const row = (slot: number) =>
        Object.fromEntries(
            [0, 1, 2].map((i) => {
                const id = 5000 + slot * 10 + i + 1;
                return [id, overrides[id] ?? s(100, 200)];
            }),
        );
    return { offense: row(0), flex: row(1), defense: row(2) };
}

function makeBuild(
    overrides: Partial<PartialBuildDataset> = {},
): PartialBuildDataset {
    return {
        championKey: "1",
        role: 2,
        wins: 500,
        games: 1000,
        runes: {
            primary: runeStats(PATHS, [0, 1, 2, 3]),
            secondary: runeStats(PATHS, [1, 2, 3]),
            shards: shardStats(),
        },
        items: {
            boots: { 3020: s(100, 200), 3158: s(90, 200) },
            statsByOrder: [
                { 6655: s(150, 300), 3157: s(100, 200) },
                { 3157: s(150, 300), 6655: s(100, 200), 3089: s(90, 200) },
                { 3089: s(150, 300), 3020: s(140, 300), 3135: s(100, 200) },
                {},
                {},
            ],
            startingSets: { "1056_2003": s(200, 400), "1055": s(100, 200) },
            sets: {},
        },
        summonerSpells: { "4_14": s(250, 500), "4_12": s(200, 400) },
        skills: {
            order: {
                QWE: s(250, 500),
                QEW: s(100, 200),
            } as PartialBuildDataset["skills"]["order"],
            level: [],
        },
        ...overrides,
    };
}

function recommend(
    partial: PartialBuildDataset,
    full: PartialBuildDataset = partial,
) {
    const fullBuild: FullBuildDataset = { ...full, matchups: [] };
    const analysis = analyzeBuild(dataset, dataset, partial, fullBuild, {
        ignoreChampionWinrates: false,
        riskLevel: "medium",
        minGames: 0,
    });
    return recommendBuild(dataset, partial, analysis);
}

function recommendedBuild(
    partial: PartialBuildDataset,
    full?: PartialBuildDataset,
): RecommendedBuild {
    const result = recommend(partial, full);
    if (!result.available) throw new Error("expected a build");
    return result.build;
}

const runeOf = (id: number) => dataset.runeData[id];

describe("recommendBuild runes", () => {
    test("builds a valid page: keystone + one rune per row, two secondary rows, three shards", () => {
        const runes = recommendedBuild(makeBuild()).runes!;
        const primary = runes.primary.map((s) => runeOf(s.choice.value));
        expect(primary.map((r) => r.slot)).toEqual([0, 1, 2, 3]);
        expect(primary.every((r) => r.pathId === runes.primaryPathId)).toBe(
            true,
        );

        const secondary = runes.secondary.map((s) => runeOf(s.choice.value));
        expect(secondary).toHaveLength(2);
        expect(secondary[0].slot).not.toBe(secondary[1].slot);
        expect(secondary.every((r) => r.slot >= 1 && r.slot <= 3)).toBe(true);
        expect(secondary.every((r) => r.pathId === runes.secondaryPathId)).toBe(
            true,
        );
        expect(runes.secondaryPathId).not.toBe(runes.primaryPathId);

        expect(runes.shards).toHaveLength(3);
        expect(
            runes.shards.map((s) => Math.floor((s.choice.value - 5000) / 10)),
        ).toEqual([0, 1, 2]);
    });

    test("the keystone decides the primary path, the secondary never uses it", () => {
        const build = makeBuild({
            runes: {
                primary: runeStats(PATHS, [0, 1, 2, 3], {
                    301: s(160, 200),
                }),
                // Secondary stats strongly favour the primary path: must be ignored.
                secondary: runeStats(PATHS, [1, 2, 3], {
                    311: s(190, 200),
                    321: s(190, 200),
                    131: s(190, 200),
                }),
                shards: shardStats(),
            },
        });
        const runes = recommendedBuild(build).runes!;
        expect(runes.primary[0].choice.value).toBe(301);
        expect(runes.primaryPathId).toBe(3);
        expect(runes.secondaryPathId).not.toBe(3);
    });

    test("secondary takes the best two runes of one path from different rows", () => {
        const build = makeBuild({
            runes: {
                primary: runeStats(PATHS, [0, 1, 2, 3], { 101: s(150, 200) }),
                secondary: runeStats(PATHS, [1, 2, 3], {
                    // Two top runes in the same row of path 2: only one may be used.
                    210: s(170, 200),
                    211: s(165, 200),
                    221: s(160, 200),
                }),
                shards: shardStats(),
            },
        });
        const runes = recommendedBuild(build).runes!;
        expect(runes.primaryPathId).toBe(1);
        expect(runes.secondaryPathId).toBe(2);
        expect(runes.secondary.map((s) => s.choice.value)).toEqual([210, 221]);
    });

    test("no runes when the dataset has no data for a required row", () => {
        const build = makeBuild({
            runes: {
                primary: runeStats(PATHS, [0, 1, 2]),
                secondary: runeStats(PATHS, [1, 2, 3]),
                shards: shardStats(),
            },
        });
        expect(recommendedBuild(build).runes).toBeUndefined();
    });
});

describe("recommendBuild selection rule", () => {
    test("best adjusted win rate wins over a better raw win rate with few games", () => {
        const partial = makeBuild({
            games: 530,
            wins: 300,
            summonerSpells: {
                // 100% raw over 30 games (eligible, above 5%), but 50% in
                // the prior.
                "4_14": s(30, 30),
                "4_12": s(270, 500),
            },
        });
        const full = makeBuild({
            summonerSpells: { "4_14": s(50, 100), "4_12": s(270, 500) },
        });
        const slot = recommendedBuild(partial, full).summonerSpells!;
        expect(slot.choice.value).toEqual([4, 12]);
        expect(slot.alternatives.map((c) => c.value)).toEqual([[4, 14]]);
        expect(slot.choice.lowConfidence).toBe(false);
        expect(slot.alternatives[0].rawWinrate).toBe(1);
        expect(slot.alternatives[0].winrate).toBeLessThan(0.51);
    });

    test("a rarely played option cannot win on a small sample", () => {
        // Seen live: a shard with 26 games beat one with 2462 games. An option
        // under MIN_GAME_SHARE (5%) is not eligible, however good it looks.
        const partial = makeBuild({
            games: 1000,
            wins: 500,
            summonerSpells: { "4_14": s(30, 40), "4_12": s(480, 960) },
        });
        const slot = recommendedBuild(partial).summonerSpells!;
        expect(slot.choice.value).toEqual([4, 12]);
        expect(slot.choice.lowConfidence).toBe(false);
    });

    test("falls back to the most played option, marked low confidence", () => {
        const partial = makeBuild({
            games: 100000,
            wins: 50000,
            summonerSpells: { "4_14": s(5, 5), "4_12": s(30, 60) },
        });
        const slot = recommendedBuild(partial).summonerSpells!;
        expect(slot.choice.value).toEqual([4, 12]);
        expect(slot.choice.lowConfidence).toBe(true);
        expect(slot.choice.games).toBe(60);
        expect(slot.alternatives[0].value).toEqual([4, 14]);
        expect(slot.alternatives[0].lowConfidence).toBe(true);
    });

    test("lists the next two alternatives ordered by rating, best first", () => {
        const partial = makeBuild({
            items: {
                ...makeBuild().items,
                boots: {
                    1: s(260, 500),
                    2: s(250, 500),
                    3: s(240, 500),
                    4: s(230, 500),
                },
            },
        });
        const boots = recommendedBuild(partial).boots!;
        expect(boots.choice.value).toBe(1);
        expect(boots.alternatives.map((c) => c.value)).toEqual([2, 3]);
        expect(boots.choice.rating).toBeGreaterThan(
            boots.alternatives[0].rating,
        );
        expect(boots.alternatives[0].rating).toBeGreaterThan(
            boots.alternatives[1].rating,
        );
        expect(boots.choice.games).toBe(500);
        expect(boots.choice.wins).toBe(260);
    });

    test("core items follow buying order, without boots or repeated items", () => {
        const build = recommendedBuild(makeBuild());
        // Order 2 prefers 3157 and order 3 prefers 3089 ... but 6655 and 3157
        // are taken, and 3020 is boots.
        expect(build.coreItems.map((c) => c.choice.value)).toEqual([
            6655, 3157, 3089,
        ]);
        expect(build.startingItems!.choice.value).toEqual([1056, 2003]);
        expect(build.boots!.choice.value).toBe(3020);
        expect(build.skillOrder!.choice.value).toBe("QWE");
        expect(build.skillOrder!.alternatives.map((c) => c.value)).toEqual([
            "QEW",
        ]);
        expect(build.summonerSpells!.choice.value).toEqual([4, 14]);
    });
});

describe("recommendBuild identity", () => {
    test("the build carries the champion key and role it was computed for", () => {
        const build = recommendedBuild(
            makeBuild({ championKey: "103", role: 3 }),
        );
        expect(build.championKey).toBe("103");
        expect(build.role).toBe(3);
    });
});

describe("recommendBuild without data", () => {
    test("missing inputs return a typed unavailable result", () => {
        const build = makeBuild();
        expect(recommendBuild(undefined, build, undefined)).toEqual({
            available: false,
        });
        expect(recommendBuild(dataset, undefined, undefined)).toEqual({
            available: false,
        });
    });

    test("an empty build returns unavailable instead of throwing", () => {
        const empty = makeBuild({
            games: 0,
            wins: 0,
            runes: {
                primary: {},
                secondary: {},
                shards: { offense: {}, defense: {}, flex: {} },
            },
            items: { boots: {}, statsByOrder: [], startingSets: {}, sets: {} },
            summonerSpells: {},
            skills: {
                order: {} as PartialBuildDataset["skills"]["order"],
                level: [],
            },
        });
        expect(recommend(empty)).toEqual({ available: false });

        const noStats = makeBuild({
            runes: {
                primary: {},
                secondary: {},
                shards: { offense: {}, defense: {}, flex: {} },
            },
            items: { boots: {}, statsByOrder: [], startingSets: {}, sets: {} },
            summonerSpells: {},
            skills: {
                order: {} as PartialBuildDataset["skills"]["order"],
                level: [],
            },
        });
        expect(recommend(noStats)).toEqual({ available: false });
    });

    test("slots without data are omitted, the rest is still recommended", () => {
        const build = recommendedBuild(makeBuild({ summonerSpells: {} }));
        expect(build.summonerSpells).toBeUndefined();
        expect(build.boots).toBeDefined();
    });
});
