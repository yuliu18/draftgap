import { describe, expect, test } from "bun:test";
import { mapLcuMatchHistory, mergePersonalMatches } from "./lcu-match-history";
import { buildPersonalStats, PersonalMatch } from "./personal-stats";
import {
    parsePersonalMatches,
    serializePersonalMatches,
} from "./personal-storage";
import { Role } from "../models/Role";

const keyOf = (id: number) => (id === 999 ? undefined : String(id));

type G = Record<string, unknown>;
function game(over: G = {}, participant: G = {}) {
    return {
        gameId: 1,
        queueId: 420,
        gameCreation: 1700000000000,
        participants: [
            {
                championId: 103,
                stats: { win: true },
                timeline: { lane: "MIDDLE", role: "SOLO" },
                ...participant,
            },
        ],
        ...over,
    };
}
const wrap = (...games: unknown[]) => ({ games: { games } });

describe("mapLcuMatchHistory", () => {
    test("maps a valid game", () => {
        expect(mapLcuMatchHistory(wrap(game()), keyOf)).toEqual([
            {
                championKey: "103",
                role: Role.Middle,
                win: true,
                timestamp: 1700000000000,
                gameId: 1,
            },
        ]);
    });

    test("wrong top-level shape returns []", () => {
        for (const raw of [
            null,
            undefined,
            42,
            "x",
            [],
            {},
            { games: null },
            { games: {} },
            { games: { games: "x" } },
        ]) {
            expect(mapLcuMatchHistory(raw, keyOf)).toEqual([]);
        }
    });

    test("non-object game entries are skipped", () => {
        expect(
            mapLcuMatchHistory(wrap(null, 3, "x", game()), keyOf),
        ).toHaveLength(1);
    });

    test("default queues are 420 and 440 only", () => {
        const out = mapLcuMatchHistory(
            wrap(
                game({ gameId: 1, queueId: 420 }),
                game({ gameId: 2, queueId: 440 }),
                game({ gameId: 3, queueId: 450 }),
                game({ gameId: 4, queueId: "420" }),
            ),
            keyOf,
        );
        expect(out.map((m) => m.gameId)).toEqual([1, 2]);
    });

    test("custom queueIds override the default", () => {
        const out = mapLcuMatchHistory(
            wrap(game({ queueId: 450 }), game({ gameId: 2, queueId: 420 })),
            keyOf,
            { queueIds: [450] },
        );
        expect(out.map((m) => m.gameId)).toEqual([1]);
    });

    test("skips games without a participant", () => {
        expect(
            mapLcuMatchHistory(
                wrap(
                    game({ participants: [] }),
                    game({ participants: undefined }),
                ),
                keyOf,
            ),
        ).toEqual([]);
    });

    test("skips unknown champion ids", () => {
        expect(
            mapLcuMatchHistory(wrap(game({}, { championId: 999 })), keyOf),
        ).toEqual([]);
        expect(
            mapLcuMatchHistory(wrap(game({}, { championId: "103" })), keyOf),
        ).toEqual([]);
    });

    test("skips non-boolean win", () => {
        for (const win of ["true", 1, undefined]) {
            expect(
                mapLcuMatchHistory(wrap(game({}, { stats: { win } })), keyOf),
            ).toEqual([]);
        }
        const out = mapLcuMatchHistory(
            wrap(game({}, { stats: { win: false } })),
            keyOf,
        );
        expect(out[0].win).toBe(false);
    });

    test("skips non-finite gameCreation", () => {
        for (const gameCreation of [NaN, Infinity, "1", null, undefined]) {
            expect(
                mapLcuMatchHistory(wrap(game({ gameCreation })), keyOf),
            ).toEqual([]);
        }
    });

    test("gameId is omitted when not a finite number", () => {
        const out = mapLcuMatchHistory(wrap(game({ gameId: "x" })), keyOf);
        expect(out).toHaveLength(1);
        expect("gameId" in out[0]).toBe(false);
    });

    const roleRows: [string, string, Role][] = [
        ["TOP", "SOLO", Role.Top],
        ["JUNGLE", "NONE", Role.Jungle],
        ["MIDDLE", "SOLO", Role.Middle],
        ["MID", "SOLO", Role.Middle],
        ["BOTTOM", "DUO_CARRY", Role.Bottom],
        ["BOTTOM", "CARRY", Role.Bottom],
        ["BOT", "DUO_CARRY", Role.Bottom],
        ["BOT", "CARRY", Role.Bottom],
        ["BOTTOM", "DUO_SUPPORT", Role.Support],
        ["BOTTOM", "SUPPORT", Role.Support],
        ["BOT", "DUO_SUPPORT", Role.Support],
        ["BOT", "SUPPORT", Role.Support],
    ];
    for (const [lane, role, expected] of roleRows) {
        test(`lane ${lane} role ${role} -> ${expected}`, () => {
            const out = mapLcuMatchHistory(
                wrap(game({}, { timeline: { lane, role } })),
                keyOf,
            );
            expect(out.map((m) => m.role)).toEqual([expected]);
        });
    }

    test("direct position strings on timeline and participant", () => {
        const rows: [string, Role][] = [
            ["TOP", Role.Top],
            ["JUNGLE", Role.Jungle],
            ["MIDDLE", Role.Middle],
            ["BOTTOM", Role.Bottom],
            ["UTILITY", Role.Support],
        ];
        for (const [p, expected] of rows) {
            const onTimeline = mapLcuMatchHistory(
                wrap(
                    game(
                        {},
                        {
                            timeline: {
                                lane: "NONE",
                                role: "NONE",
                                position: p,
                            },
                        },
                    ),
                ),
                keyOf,
            );
            expect(onTimeline.map((m) => m.role)).toEqual([expected]);
            const onParticipant = mapLcuMatchHistory(
                wrap(game({}, { timeline: undefined, teamPosition: p })),
                keyOf,
            );
            expect(onParticipant.map((m) => m.role)).toEqual([expected]);
        }
    });

    test("undeterminable role is skipped", () => {
        for (const timeline of [
            undefined,
            { lane: "NONE", role: "NONE" },
            { lane: "BOTTOM", role: "SOLO" },
            { lane: "BOTTOM", role: "NONE" },
        ]) {
            expect(
                mapLcuMatchHistory(wrap(game({}, { timeline })), keyOf),
            ).toEqual([]);
        }
    });

    test("never throws on hostile input", () => {
        expect(() =>
            mapLcuMatchHistory(
                wrap(
                    { participants: [null] },
                    { participants: "x" },
                    {
                        queueId: 420,
                        participants: [{ stats: null, timeline: 3 }],
                    },
                ),
                keyOf,
            ),
        ).not.toThrow();
    });
});

describe("mergePersonalMatches", () => {
    const m = (
        championKey: string,
        timestamp: number,
        gameId?: number,
        role: Role = Role.Top,
    ): PersonalMatch => ({
        championKey,
        role,
        win: true,
        timestamp,
        ...(gameId === undefined ? {} : { gameId }),
    });

    test("dedupes by gameId when both have one", () => {
        const out = mergePersonalMatches(
            [m("1", 10, 5)],
            [m("2", 99, 5), m("3", 20, 6)],
        );
        expect(out.map((x) => x.gameId)).toEqual([6, 5]);
        expect(out.find((x) => x.gameId === 5)?.championKey).toBe("1");
    });

    test("dedupes by champion+role+timestamp otherwise", () => {
        const out = mergePersonalMatches(
            [m("1", 10)],
            [m("1", 10, 7), m("1", 10, undefined, Role.Support), m("1", 11)],
        );
        expect(out).toHaveLength(3);
    });

    test("sorts by timestamp descending", () => {
        const out = mergePersonalMatches([m("1", 1), m("2", 3)], [m("3", 2)]);
        expect(out.map((x) => x.timestamp)).toEqual([3, 2, 1]);
    });

    test("does not mutate inputs", () => {
        const a = [m("1", 1), m("2", 3)];
        const b = [m("3", 2)];
        const ac = JSON.stringify(a);
        const bc = JSON.stringify(b);
        mergePersonalMatches(a, b);
        expect(JSON.stringify(a)).toBe(ac);
        expect(JSON.stringify(b)).toBe(bc);
    });

    test("merging with an empty list keeps everything", () => {
        expect(mergePersonalMatches([], [m("1", 1)])).toHaveLength(1);
        expect(mergePersonalMatches([m("1", 1)], [])).toHaveLength(1);
    });
});

describe("gameId in storage and stats", () => {
    const base = {
        championKey: "103",
        role: Role.Middle,
        win: true,
        timestamp: 1000,
    };

    test("gameId survives a round trip", () => {
        const list = [{ ...base, gameId: 77 }];
        expect(parsePersonalMatches(serializePersonalMatches(list))).toEqual(
            list,
        );
    });

    test("invalid gameId is dropped and the entry stays valid", () => {
        const raw = JSON.stringify([
            { ...base, gameId: "7" },
            { ...base, gameId: null },
            { ...base, gameId: 7.5, timestamp: 1 },
        ]);
        const out = parsePersonalMatches(raw);
        expect(out).toHaveLength(3);
        expect(out[0]).toEqual(base);
        expect(out[1]).toEqual(base);
        expect(out[2]).toEqual({ ...base, timestamp: 1, gameId: 7.5 });
    });

    test("entries without gameId keep the previous shape", () => {
        expect(parsePersonalMatches(JSON.stringify([base]))).toEqual([base]);
    });

    test("buildPersonalStats ignores gameId", () => {
        const withId = buildPersonalStats([{ ...base, gameId: 1 }]);
        const without = buildPersonalStats([base]);
        expect(withId).toEqual(without);
    });
});
