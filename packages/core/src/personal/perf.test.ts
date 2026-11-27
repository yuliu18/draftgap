import { describe, expect, test } from "bun:test";
import { mapLcuMatchHistory, mergePersonalMatches } from "./lcu-match-history";
import { walkMatchHistory } from "./lcu-sync";
import { buildPersonalStats, PersonalMatch } from "./personal-stats";
import {
    parsePersonalMatches,
    serializePersonalMatches,
} from "./personal-storage";
import { Role } from "../models/Role";

const keyOf = (id: number) => String(id);

const fullStats = {
    win: true,
    kills: 7,
    deaths: 2,
    assists: 9,
    totalMinionsKilled: 180,
    neutralMinionsKilled: 20,
    goldEarned: 12000,
    totalDamageDealtToChampions: 25000,
    visionScore: 30,
};

function game(
    over: Record<string, unknown> = {},
    stats: Record<string, unknown> = fullStats,
) {
    return {
        gameId: 1,
        queueId: 420,
        gameCreation: 1700000000000,
        gameDuration: 1800,
        participants: [
            {
                championId: 103,
                stats,
                timeline: { lane: "MIDDLE", role: "SOLO" },
            },
        ],
        ...over,
    };
}
const wrap = (...games: unknown[]) => ({ games: { games } });

const perf = {
    kills: 7,
    deaths: 2,
    assists: 9,
    cs: 200,
    gold: 12000,
    damage: 25000,
    vision: 30,
    duration: 1800,
    queueId: 420,
};

describe("mapLcuMatchHistory perf", () => {
    test("fills perf from participant stats", () => {
        expect(mapLcuMatchHistory(wrap(game()), keyOf)).toEqual([
            {
                championKey: "103",
                role: Role.Middle,
                win: true,
                timestamp: 1700000000000,
                gameId: 1,
                perf,
            },
        ]);
    });

    test("gameDuration in milliseconds is converted to seconds", () => {
        const [m] = mapLcuMatchHistory(
            wrap(game({ gameDuration: 1800000 })),
            keyOf,
        );
        expect(m.perf?.duration).toBe(1800);
    });

    test("20000 is still seconds, 20001 is milliseconds", () => {
        const a = mapLcuMatchHistory(
            wrap(game({ gameDuration: 20000 })),
            keyOf,
        );
        const b = mapLcuMatchHistory(
            wrap(game({ gameDuration: 20001 })),
            keyOf,
        );
        expect(a[0].perf?.duration).toBe(20000);
        expect(b[0].perf?.duration).toBeCloseTo(20.001);
    });

    test("missing or non-finite fields are left out", () => {
        const [m] = mapLcuMatchHistory(
            wrap(
                game(
                    { gameDuration: undefined },
                    {
                        win: true,
                        kills: 3,
                        deaths: NaN,
                        assists: "5",
                        visionScore: Infinity,
                        goldEarned: 100,
                    },
                ),
            ),
            keyOf,
        );
        expect(m.perf).toEqual({ kills: 3, gold: 100, queueId: 420 });
    });

    test("a game with negative duration is skipped", () => {
        expect(
            mapLcuMatchHistory(wrap(game({ gameDuration: -5 })), keyOf),
        ).toEqual([]);
    });

    test("neutral minions missing still counts the lane minions", () => {
        const [m] = mapLcuMatchHistory(
            wrap(game({}, { win: true, totalMinionsKilled: 150 })),
            keyOf,
        );
        expect(m.perf?.cs).toBe(150);
    });

    test("a game with no perf numbers still imports (and has no perf)", () => {
        const [m] = mapLcuMatchHistory(
            wrap(
                game({ gameDuration: undefined, queueId: 420 }, { win: false }),
            ),
            keyOf,
        );
        // queueId alone is not performance data, but it is stored with it.
        expect(m.win).toBe(false);
        expect(m.perf).toBeUndefined();
    });
});

describe("storage codec perf", () => {
    const m: PersonalMatch = {
        championKey: "103",
        role: Role.Middle,
        win: true,
        timestamp: 1000,
        perf,
    };

    test("perf round-trips", () => {
        expect(parsePersonalMatches(serializePersonalMatches([m]))).toEqual([
            m,
        ]);
    });

    test("invalid perf fields are dropped, the match stays valid", () => {
        const raw = JSON.stringify([
            {
                ...m,
                perf: {
                    kills: "x",
                    deaths: -1,
                    assists: 4,
                    cs: null,
                    queueId: 420,
                },
            },
            { ...m, timestamp: 2000, perf: "nope" },
            { ...m, timestamp: 3000, perf: { kills: "x" } },
        ]);
        const out = parsePersonalMatches(raw);
        expect(out).toHaveLength(3);
        expect(out[0].perf).toEqual({ assists: 4, queueId: 420 });
        expect(out[1].perf).toBeUndefined();
        expect(out[2].perf).toBeUndefined();
        expect(out[2].championKey).toBe("103");
    });

    test("matches without perf round trip as before", () => {
        const plain = { ...m, perf: undefined };
        delete (plain as Partial<PersonalMatch>).perf;
        expect(parsePersonalMatches(serializePersonalMatches([plain]))).toEqual(
            [plain],
        );
    });
});

describe("mergePersonalMatches perf", () => {
    const base: PersonalMatch = {
        championKey: "103",
        role: Role.Middle,
        win: true,
        timestamp: 1000,
        gameId: 5,
    };

    test("a duplicate enriches a stored match that has no perf", () => {
        const out = mergePersonalMatches([base], [{ ...base, perf }]);
        expect(out).toEqual([{ ...base, perf }]);
    });

    test("enriches by fallback key when gameId is missing", () => {
        const noId = { ...base, gameId: undefined };
        delete noId.gameId;
        const out = mergePersonalMatches([noId], [{ ...noId, perf }]);
        expect(out).toEqual([{ ...noId, perf }]);
    });

    test("a stored match that has perf is not touched", () => {
        const stored = { ...base, perf: { kills: 1 } };
        const out = mergePersonalMatches([stored], [{ ...base, perf }]);
        expect(out).toEqual([stored]);
    });

    test("a duplicate without perf changes nothing", () => {
        expect(mergePersonalMatches([base], [{ ...base }])).toEqual([base]);
    });

    test("does not mutate the stored entry", () => {
        const stored = { ...base };
        mergePersonalMatches([stored], [{ ...base, perf }]);
        expect(stored.perf).toBeUndefined();
    });

    test("different games are still added", () => {
        const other = { ...base, gameId: 6, timestamp: 2000 };
        expect(
            mergePersonalMatches([base], [other]).map((x) => x.gameId),
        ).toEqual([6, 5]);
    });
});

describe("walkMatchHistory enrichment", () => {
    test("a page of known games that gain perf does not stop the walk", async () => {
        const stored: PersonalMatch[] = [1, 2, 3, 4].map((id) => ({
            championKey: "103",
            role: Role.Middle,
            win: true,
            timestamp: 1700000000000 + id,
            gameId: id,
        }));
        const g = (id: number) =>
            game({ gameId: id, gameCreation: 1700000000000 + id });
        const pages = [wrap(g(1), g(2)), wrap(g(3), g(4))];
        let i = 0;
        const out = await walkMatchHistory(
            async () => pages[i++],
            stored,
            keyOf,
            { pageSize: 2, maxGames: 4 },
        );
        expect(i).toBe(2);
        expect(out.imported).toBe(0);
        expect(out.matches.every((m) => m.perf !== undefined)).toBe(true);
    });
});

describe("buildPersonalStats ignores perf", () => {
    test("same stats with and without perf", () => {
        const a: PersonalMatch = {
            championKey: "1",
            role: Role.Top,
            win: true,
            timestamp: 1,
        };
        const b: PersonalMatch = { ...a, perf };
        expect(buildPersonalStats([b])).toEqual(buildPersonalStats([a]));
    });
});
