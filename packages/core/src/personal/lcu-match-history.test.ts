import { describe, expect, test } from "bun:test";
import {
    mapLcuMatchHistory,
    mapLcuMatchHistoryWithResult,
    mergePersonalMatches,
} from "./lcu-match-history";
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

    test("skips remakes under 300 seconds and keeps the 300-second boundary", () => {
        const out = mapLcuMatchHistory(
            wrap(
                game({ gameId: 1, gameDuration: 299 }),
                game({ gameId: 2, gameDuration: 300 }),
                game({ gameId: 3, gameDuration: 301 }),
            ),
            keyOf,
        );
        expect(out.map((m) => [m.gameId, m.perf?.duration])).toEqual([
            [2, 300],
            [3, 301],
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

    test("default queues are the Summoner's Rift PvP queues", () => {
        // Seen in a real client: 400 normal draft, 440 flex, 480 swiftplay.
        const accepted = [400, 420, 430, 440, 480, 490];
        const rejected = [450, 700, 710, 1700, 2400, 3100, 3140];
        const out = mapLcuMatchHistory(
            wrap(
                ...[...accepted, ...rejected].map((queueId) =>
                    game({ gameId: queueId, queueId }),
                ),
                game({ gameId: 4, queueId: "420" }),
            ),
            keyOf,
        );
        expect(out.map((m) => m.gameId).sort((a, b) => a! - b!)).toEqual(
            accepted,
        );
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
        // The bottom carry can also be reported as SOLO, NONE, or DUO.
        ["BOTTOM", "SOLO", Role.Bottom],
        ["BOTTOM", "NONE", Role.Bottom],
        ["BOTTOM", "DUO", Role.Bottom],
    ];
    test("preserves recognized lane and bottom support mappings", () => {
        for (const [lane, role, expected] of roleRows) {
            const out = mapLcuMatchHistory(
                wrap(game({}, { timeline: { lane, role } })),
                keyOf,
            );
            expect(out.map((m) => m.role)).toEqual([expected]);
        }
    });

    test("NONE and empty lanes are not made Support by the role field", () => {
        for (const lane of ["NONE", ""]) {
            for (const role of ["SUPPORT", "DUO_SUPPORT"]) {
                expect(
                    mapLcuMatchHistory(
                        wrap(game({}, { timeline: { lane, role } })),
                        keyOf,
                    ),
                ).toEqual([]);
            }
        }
    });

    test("Smite in either slot resolves only unknown roles", () => {
        const unknown = { lane: "NONE", role: "SUPPORT" };
        const out = mapLcuMatchHistory(
            wrap(
                game({ gameId: 1 }, { timeline: unknown, spell1Id: 11 }),
                game({ gameId: 2 }, { timeline: unknown, spell2Id: 11 }),
                game({ gameId: 3 }, { spell1Id: 11 }),
            ),
            keyOf,
        );
        expect(out.map(({ gameId, role }) => [gameId, role])).toEqual([
            [1, Role.Jungle],
            [2, Role.Jungle],
            [3, Role.Middle],
        ]);
    });

    test("uses batch and stored role frequency, newest on ties, and excludes inferred or re-read votes", () => {
        const unknown = game(
            {},
            { timeline: { lane: "NONE", role: "SUPPORT" } },
        );
        const batchMiddle = game({ gameId: 2, gameCreation: 30 });
        const known = (role: Role, timestamp: number): PersonalMatch => ({
            championKey: "103",
            role,
            win: true,
            timestamp,
        });
        const stored = [
            known(Role.Top, 40),
            { ...known(Role.Support, 1700000000000), gameId: 1 },
        ];
        const inferred = { ...known(Role.Top, 50), roleInferred: true };
        const parsed = parsePersonalMatches(
            serializePersonalMatches([...stored, inferred]),
        );
        const options = { knownMatches: [...stored, inferred] };
        const tied = mapLcuMatchHistory(
            wrap(unknown, batchMiddle),
            keyOf,
            options,
        );
        expect(
            tied.map(({ role, roleInferred }) => [role, roleInferred]),
        ).toEqual([
            [Role.Top, true],
            [Role.Middle, undefined],
        ]);
        const majority = mapLcuMatchHistory(
            wrap(unknown, batchMiddle, game({ gameId: 3, gameCreation: 20 })),
            keyOf,
            options,
        );
        expect(majority[0]).toEqual({
            ...known(Role.Middle, 1700000000000),
            gameId: 1,
            roleInferred: true,
        });
        expect(parsed).toEqual(options.knownMatches);
    });

    test("counts only otherwise eligible games skipped for unknown role", () => {
        const timeline = { lane: "NONE", role: "SOLO" };
        const out = mapLcuMatchHistoryWithResult(
            wrap(
                game({}, { timeline }),
                game({ gameDuration: 299 }, { timeline }),
                game({ queueId: 450 }, { timeline }),
                game({}, { timeline, championId: 999 }),
                game({}, { timeline, stats: {} }),
            ),
            keyOf,
        );
        expect(out).toEqual({ matches: [], skippedUnknownRole: 1 });
    });

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
                                lane: "UNKNOWN",
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
            { lane: "NONE", role: "SOLO" },
            { lane: "NONE", role: "CARRY" },
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

    test("replaces a re-read role in place by id or champion and timestamp", () => {
        const unrelated = [m("2", 5), m("3", 20)];
        for (const gameId of [undefined, 7]) {
            const existing = [
                unrelated[0],
                m("1", 10, gameId, Role.Support),
                unrelated[1],
            ];
            const incoming = m("1", 10, 7, Role.Middle);
            expect(mergePersonalMatches(existing, [incoming])).toEqual([
                unrelated[0],
                incoming,
                unrelated[1],
            ]);
            expect(existing[1].role).toBe(Role.Support);
        }
        expect(mergePersonalMatches([m("1", 10, 5)], [m("2", 99, 5)])).toEqual([
            m("2", 99, 5),
        ]);
        expect(
            mergePersonalMatches([m("1", 10, 5)], [m("1", 10, 6)]),
        ).toHaveLength(2);
    });

    test("keeps duplicates that are already in the existing list", () => {
        const existing = [m("1", 10), m("1", 10), m("2", 5, 3), m("3", 4, 3)];
        const out = mergePersonalMatches(existing, [m("9", 1)]);
        expect(out).toHaveLength(5);
        expect(mergePersonalMatches(existing, [])).toHaveLength(4);
    });

    test("keeps the latest incoming record for a repeated match", () => {
        const out = mergePersonalMatches(
            [],
            [m("1", 10, 5), m("2", 11, 5), m("3", 12), m("3", 12)],
        );
        expect(out.map((x) => x.championKey)).toEqual(["3", "2"]);
    });

    test("inserts new matches chronologically in an ordered history", () => {
        const out = mergePersonalMatches([m("2", 3), m("1", 1)], [m("3", 2)]);
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
