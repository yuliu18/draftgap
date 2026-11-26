import { expect, test } from "bun:test";
import { mapScoutingSnapshot, mapRecentPerformance } from "./scouting-snapshot";
import { scoutingGameId, selectMatchup } from "./match-view";

const rawPlayer = (
    team: number,
    puuid: string,
    selectedPosition = "MIDDLE",
) => ({
    team,
    player: { puuid, selectedPosition, championId: 1 },
});

const snapshot = mapScoutingSnapshot({
    status: "available",
    phase: "InProgress",
    gameId: 123,
    players: [rawPlayer(2, "me"), rawPlayer(2, "ally"), rawPlayer(1, "rival")],
});

test("maps the game ID and selects the opposite team by the current player's PUUID and role", () => {
    expect(snapshot).toMatchObject({ gameId: 123 });
    expect(selectMatchup(snapshot, "me")).toMatchObject({
        me: { team: 2, puuid: "me" },
        opponent: { team: 1, puuid: "rival" },
    });
    expect(selectMatchup(snapshot, "unknown")).toEqual({});
    expect(selectMatchup(snapshot, undefined)).toEqual({});
    const ambiguous = mapScoutingSnapshot({
        status: "available",
        players: [
            rawPlayer(2, "me"),
            rawPlayer(1, "rival"),
            rawPlayer(1, "other"),
        ],
    });
    expect(selectMatchup(ambiguous, "me").opponent).toBeUndefined();
    const missingRole = mapScoutingSnapshot({
        status: "available",
        players: [rawPlayer(2, "me", ""), rawPlayer(1, "rival", "")],
    });
    expect(selectMatchup(missingRole, "me").opponent).toBeUndefined();
    expect(mapScoutingSnapshot({ status: "available" })).not.toHaveProperty(
        "gameId",
    );
});

test("only unrequested identified games in permitted phases trigger scouting", () => {
    const attempted = new Set([123]);
    for (const phase of ["GameStart", "InProgress", "Reconnect"]) {
        expect(
            scoutingGameId({ phase, gameId: 123 }, attempted),
        ).toBeUndefined();
        expect(scoutingGameId({ phase, gameId: 124 }, attempted)).toBe(124);
        expect(
            scoutingGameId({ phase, gameId: null }, attempted),
        ).toBeUndefined();
        expect(scoutingGameId({ phase, gameId: 0 }, attempted)).toBeUndefined();
    }
    for (const phase of ["ChampSelect", "Lobby", "EndOfGame", "None"]) {
        expect(
            scoutingGameId({ phase, gameId: 124 }, attempted),
        ).toBeUndefined();
    }
});

test("recent form keeps individual results in history order and caps at ten", () => {
    const results = [
        false,
        true,
        true,
        false,
        true,
        false,
        true,
        true,
        true,
        false,
        true,
    ];
    const games = results.map((win) => ({
        queueId: 420,
        participants: [
            { championId: 1, stats: { win, kills: 1, deaths: 1, assists: 0 } },
        ],
    }));
    expect(mapRecentPerformance({ games: { games } })?.form).toEqual(
        results.slice(0, 10),
    );
});
