import { describe, expect, test } from "bun:test";
import {
    mapRankedStats,
    mapRecentPerformance,
    mapScoutingSnapshot,
} from "./scouting-snapshot";
import { Role } from "../models/Role";
import rankedFixture from "./__fixtures__/ranked-stats.json";
import historyFixture from "./__fixtures__/match-history.json";

const PUUID = "00000000-1111-4222-8333-444444444444";

type G = Record<string, unknown>;
function game(champ: number, win: boolean, over: G = {}, kda = [1, 2, 3]) {
    return {
        queueId: 420,
        mapId: 11,
        participants: [
            {
                championId: champ,
                stats: {
                    win,
                    kills: kda[0],
                    deaths: kda[1],
                    assists: kda[2],
                },
            },
        ],
        ...over,
    };
}
const wrap = (...games: unknown[]) => ({ games: { games } });

describe("mapRankedStats", () => {
    test("real response: solo and flex from the observed shape", () => {
        const { solo, flex } = mapRankedStats(rankedFixture);
        expect(solo).toEqual({
            status: "ranked",
            tier: "BRONZE",
            division: "II",
            leaguePoints: 2,
            wins: 115,
            losses: 123,
            winrate: 115 / 238,
        });
        expect(flex).toMatchObject({
            status: "ranked",
            tier: "BRONZE",
            division: "IV",
            leaguePoints: 69,
            wins: 39,
            losses: 52,
        });
    });

    test("unranked entry (empty tier, division NA)", () => {
        const r = mapRankedStats({
            queues: [
                { queueType: "RANKED_SOLO_5x5", tier: "", division: "NA" },
                { queueType: "RANKED_FLEX_SR", tier: "NONE", division: "NA" },
            ],
        });
        expect(r).toEqual({
            solo: { status: "unranked" },
            flex: { status: "unranked" },
        });
    });

    test("missing queue in a well-formed response is unranked", () => {
        const r = mapRankedStats({
            queues: [
                {
                    queueType: "RANKED_SOLO_5x5",
                    tier: "GOLD",
                    division: "I",
                    leaguePoints: 10,
                    wins: 1,
                    losses: 0,
                },
            ],
        });
        expect(r.solo).toMatchObject({ status: "ranked", tier: "GOLD" });
        expect(r.flex).toEqual({ status: "unranked" });
    });

    test("falls back to queueMap and handles apex tiers without division", () => {
        const r = mapRankedStats({
            queueMap: {
                RANKED_SOLO_5x5: {
                    tier: "MASTER",
                    division: "NA",
                    leaguePoints: 120,
                    wins: 0,
                    losses: 0,
                },
            },
        });
        expect(r.solo).toEqual({
            status: "ranked",
            tier: "MASTER",
            leaguePoints: 120,
            wins: 0,
            losses: 0,
        });
    });

    test("garbage is unknown and never throws", () => {
        for (const bad of [null, undefined, 1, "x", [], {}, { queues: 5 }]) {
            expect(() => mapRankedStats(bad)).not.toThrow();
            expect(mapRankedStats(bad).solo.status).toBe("unknown");
        }
        expect(
            mapRankedStats({
                queues: [null, 3, { queueType: "RANKED_SOLO_5x5" }],
            }).flex.status,
        ).toBe("unranked");
    });
});

describe("mapRecentPerformance", () => {
    test("real response: only Summoner's Rift queues, at most 10", () => {
        const r = mapRecentPerformance(historyFixture)!;
        expect(r.games).toBeLessThanOrEqual(10);
        expect(r.games).toBeGreaterThan(0);
        expect(r.wins).toBeLessThanOrEqual(r.games);
        expect(r.winrate).toBe(r.wins / r.games);
        expect(r.topChampions.length).toBeLessThanOrEqual(3);
        // Customs (3100), ARAM-like map 12 and queue 2400 are excluded.
        const eligible = historyFixture.games.games
            .filter(
                (g) =>
                    [400, 420, 430, 440, 480, 490].includes(g.queueId) &&
                    g.mapId === 11,
            )
            .slice(0, 10);
        expect(r.games).toBe(eligible.length);
    });

    test("winrate, KDA and most played champions", () => {
        const r = mapRecentPerformance(
            wrap(
                game(1, true, {}, [5, 1, 5]),
                game(2, false, {}, [0, 4, 2]),
                game(1, true, {}, [3, 1, 1]),
                game(3, false),
            ),
        )!;
        expect(r.games).toBe(4);
        expect(r.wins).toBe(2);
        expect(r.winrate).toBe(0.5);
        expect(r.kills).toBe(9);
        expect(r.deaths).toBe(8);
        expect(r.assists).toBe(11);
        expect(r.kda).toBe(20 / 8);
        expect(r.topChampions[0]).toEqual({ championId: 1, games: 2, wins: 2 });
        // Ties keep the most recent first.
        expect(r.topChampions.map((c) => c.championId)).toEqual([1, 2, 3]);
    });

    test("zero deaths does not divide by zero", () => {
        const r = mapRecentPerformance(wrap(game(1, true, {}, [4, 0, 6])))!;
        expect(r.kda).toBe(10);
    });

    test("takes the 10 most recent and skips other queues/maps", () => {
        const games = [
            game(9, true, { queueId: 450 }),
            game(9, true, { mapId: 12 }),
            ...Array.from({ length: 12 }, (_, i) => game(i < 10 ? 1 : 2, true)),
        ];
        const r = mapRecentPerformance(wrap(...games))!;
        expect(r.games).toBe(10);
        expect(r.topChampions).toEqual([
            { championId: 1, games: 10, wins: 10 },
        ]);
    });

    test("malformed games are skipped; no usable games is undefined", () => {
        const r = mapRecentPerformance(
            wrap(
                null,
                3,
                { queueId: 420 },
                game(1, true, { participants: [] }),
                {
                    ...game(1, true),
                    participants: [{ championId: 1, stats: { win: true } }],
                },
            ),
        );
        expect(r).toBeUndefined();
        for (const bad of [null, undefined, {}, { games: {} }, "x"]) {
            expect(mapRecentPerformance(bad)).toBeUndefined();
        }
    });
});

describe("mapScoutingSnapshot", () => {
    const rawPlayer = (over: G = {}, player: G = {}) => ({
        team: 1,
        player: {
            championId: 103,
            selectedPosition: "MIDDLE",
            gameName: "Fake",
            tagLine: "EUW",
            puuid: PUUID,
            ...player,
        },
        lookedUp: true,
        ranked: rankedFixture,
        matches: historyFixture,
        ...over,
    });

    test("not available passes the phase through", () => {
        expect(
            mapScoutingSnapshot({
                status: "not_available",
                phase: "ChampSelect",
                players: [],
            }),
        ).toEqual({ status: "not_available", phase: "ChampSelect" });
    });

    test("maps a full player", () => {
        const s = mapScoutingSnapshot({
            status: "available",
            phase: "InProgress",
            queueId: 420,
            players: [rawPlayer(), rawPlayer({ team: 2 })],
        });
        if (s.status !== "available") throw new Error("expected available");
        expect(s.queueId).toBe(420);
        expect(s.players).toHaveLength(2);
        const p = s.players[0];
        expect(p).toMatchObject({
            team: 1,
            championId: 103,
            role: Role.Middle,
            riotId: "Fake#EUW",
            isBot: false,
            lookedUp: true,
            rankedFailed: false,
            matchesFailed: false,
        });
        expect(p.solo.status).toBe("ranked");
        expect(p.recent?.games).toBeGreaterThan(0);
        expect(s.players[1].team).toBe(2);
    });

    test("bots and players without lookups keep what is known", () => {
        const s = mapScoutingSnapshot({
            status: "available",
            phase: "GameStart",
            players: [
                {
                    team: 2,
                    player: { championId: 5, isBot: true, puuid: "" },
                    lookedUp: false,
                },
                {
                    team: 1,
                    player: { championId: 0, summonerName: "Old Name" },
                    lookedUp: false,
                },
                { team: 1, player: { botDifficulty: "EASY" }, lookedUp: false },
            ],
        });
        if (s.status !== "available") throw new Error("expected available");
        expect(s.players[0]).toMatchObject({
            team: 2,
            championId: 5,
            isBot: true,
            lookedUp: false,
            solo: { status: "unknown" },
            flex: { status: "unknown" },
        });
        expect(s.players[0].recent).toBeUndefined();
        expect(s.players[1].riotId).toBe("Old Name");
        expect(s.players[1].championId).toBeUndefined();
        expect(s.players[2].isBot).toBe(true);
    });

    test("a failed lookup leaves the other half and flags the failure", () => {
        const s = mapScoutingSnapshot({
            status: "available",
            phase: "InProgress",
            players: [
                rawPlayer({
                    ranked: null,
                    rankedError: "LCU returned 500",
                }),
            ],
        });
        if (s.status !== "available") throw new Error("expected available");
        const p = s.players[0];
        expect(p.rankedFailed).toBe(true);
        expect(p.solo.status).toBe("unknown");
        expect(p.recent).toBeDefined();
    });

    test("never throws on garbage", () => {
        for (const bad of [
            null,
            undefined,
            3,
            "x",
            [],
            {},
            { status: "available" },
            { status: "available", players: [null, 1, {}, { team: 3 }] },
            {
                status: "available",
                players: [{ team: 1, player: 5, lookedUp: true }],
            },
        ]) {
            expect(() => mapScoutingSnapshot(bad)).not.toThrow();
        }
        expect(mapScoutingSnapshot(null)).toEqual({
            status: "not_available",
            phase: "None",
        });
        expect(
            mapScoutingSnapshot({
                status: "available",
                players: [{ team: 1, player: 5, lookedUp: true }],
            }),
        ).toMatchObject({ status: "available", players: [{ team: 1 }] });
    });
});
