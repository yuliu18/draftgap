import { describe, expect, test } from "bun:test";
import {
    buildMatchupContext,
    MatchupChatInput,
    scoutedPlayersForChat,
} from "./matchup-chat";
import { mapScoutingSnapshot } from "../scouting/scouting-snapshot";

const raw = {
    status: "available",
    phase: "InProgress",
    gameId: 5,
    players: Array.from({ length: 11 }, (_, i) => ({
        team: i < 5 ? 1 : 2,
        lookedUp: true,
        player: {
            championId: 100 + i,
            puuid: `puuid-secret-${i}`,
            gameName: `GameNameX${i}`,
            tagLine: `TAGY${i}`,
            summonerName: `SummZ${i}`,
            selectedPosition: "MIDDLE",
        },
        ranked: {
            queueMap: {
                RANKED_SOLO_5x5: {
                    tier: "gold",
                    division: "II",
                    leaguePoints: 12,
                    wins: 3,
                    losses: 2,
                },
            },
        },
        matches: {
            games: {
                games: [
                    {
                        queueId: 420,
                        mapId: 11,
                        gameDuration: 1500,
                        participants: [
                            {
                                championId: 7,
                                stats: {
                                    win: true,
                                    kills: 1,
                                    deaths: 1,
                                    assists: 1,
                                },
                            },
                        ],
                    },
                ],
            },
        },
    })),
};
const snap = mapScoutingSnapshot(raw);
if (snap.status !== "available") throw new Error("fixture must map");
const me = snap.players[0];
// The same function the match screen calls.
const players = scoutedPlayersForChat(
    snap.players,
    me,
    snap.players[5],
    (id) => (id === undefined ? "Unknown champion" : `Champion ${id}`),
);

const base = (phase: "in-game" | "champ-select"): MatchupChatInput => ({
    phase,
    me: { championName: "Ahri", role: "Middle" },
    opponent: { championName: "Zed", role: "Middle" },
    players,
    responseLanguage: "Spanish",
});

// Runs a raw client snapshot that carries identity fields through the same
// mapping the match screen uses, and checks what reaches the model.
describe("scouting privacy in the matchup chat", () => {
    test("the fixture carries identities up to the chat mapping", () => {
        expect(JSON.stringify(snap.players)).toContain("puuid-secret-0");
        expect(JSON.stringify(snap.players)).toContain("GameNameX0");
        expect(JSON.stringify(players)).not.toContain("puuid-secret");
        expect(JSON.stringify(players)).not.toContain("GameNameX");
        expect(Object.keys(players[0]).sort()).toEqual([
            "championName",
            "laneOpponent",
            "me",
            "recent",
            "solo",
            "team",
        ]);
    });

    test("marks only the player's row and places it right after the lane opponent", () => {
        expect(players.map((player) => player.me)).toEqual(
            raw.players.map((_, index) => index === 0),
        );
        const c = buildMatchupContext({
            ...base("in-game"),
            players: [...players.slice(1), players[0]],
        }).content;
        const rows = c
            .split("\n")
            .filter((line) => /^- (Ally|Enemy)/.test(line));
        expect(rows.map((line) => line.split(" | ")[0])).toEqual([
            "- Enemy (lane opponent): Champion 105",
            "- Ally (you): Champion 100",
            "- Ally: Champion 101",
            "- Ally: Champion 102",
            "- Ally: Champion 103",
            "- Ally: Champion 104",
            "- Enemy: Champion 106",
            "- Enemy: Champion 107",
            "- Enemy: Champion 108",
            "- Enemy: Champion 109",
        ]);
    });

    test("never sends player identities and stays bounded", () => {
        const c = buildMatchupContext(base("in-game")).content;
        for (const bad of ["puuid-secret", "GameNameX", "TAGY", "SummZ", "#"])
            expect(c).not.toContain(bad);
        const lines = c.split("\n");
        const i = lines.indexOf("Players (scouting):");
        const rows = lines
            .slice(i + 1)
            .filter((l) => l.startsWith("- Ally") || l.startsWith("- Enemy"));
        expect(rows.length).toBe(10);
        expect(rows[0]).toContain("(lane opponent)");
        rows.forEach((r) => expect(r.length).toBeLessThanOrEqual(180));
        expect(c).toContain("State when a sample is small");
        expect(c).toContain("Present options with their trade-offs");
    });
    test("champ-select prompts ignore scouted players", () => {
        const withP = buildMatchupContext(base("champ-select")).content;
        const without = buildMatchupContext({
            ...base("champ-select"),
            players: undefined,
        }).content;
        expect(withP).toBe(without);
        expect(withP).not.toContain("scouting");
    });
    test("oversized labels are capped", () => {
        const c = buildMatchupContext({
            ...base("in-game"),
            players: [
                {
                    team: "enemy",
                    championName: "x".repeat(500),
                    solo: { status: "ranked", tier: "y".repeat(500) },
                    recent: {
                        games: 1,
                        wins: 0,
                        topChampions: ["z".repeat(500)],
                    },
                },
            ],
        }).content;
        const row = c.split("\n").find((l) => l.startsWith("- Enemy"))!;
        expect(row.length).toBeLessThanOrEqual(180);
    });
});
