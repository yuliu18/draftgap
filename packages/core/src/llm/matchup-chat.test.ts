import { describe, expect, test } from "bun:test";
import {
    MatchupChatInput,
    appendTurn,
    buildMatchupContext,
    matchupStatsFor,
    suggestedQuestions,
    toChatMessages,
} from "./matchup-chat";
import { mapChampionKit } from "./champion-kit";
import veigar from "./__fixtures__/Veigar.es_ES.json";
import ahri from "./__fixtures__/Ahri.es_ES.json";

const input = (extra: Partial<MatchupChatInput> = {}): MatchupChatInput => ({
    phase: "champ-select",
    me: {
        championName: "Veigar",
        role: "Middle",
        kit: mapChampionKit(veigar),
        overall: { games: 5000, wins: 2600 },
    },
    opponent: {
        championName: "Ahri",
        role: "Middle",
        kit: mapChampionKit(ahri),
        overall: { games: 8000, wins: 4000 },
    },
    matchup: { games: 1234, wins: 642 },
    responseLanguage: "Spanish",
    ...extra,
});

describe("buildMatchupContext", () => {
    test("returns a system message naming both champions and roles", () => {
        const message = buildMatchupContext(input());
        expect(message.role).toBe("system");
        expect(message.content).toContain("Veigar (Middle)");
        expect(message.content).toContain("Ahri (Middle)");
    });

    test("contains both kits", () => {
        const { content } = buildMatchupContext(input());
        expect(content).toContain(veigar.data.Veigar.passive.name);
        expect(content).toContain(ahri.data.Ahri.passive.name);
        expect(content).toContain("Fuego zorruno");
    });

    test("formats matchup and champion win rates with games", () => {
        const { content } = buildMatchupContext(input());
        expect(content).toContain("52.0% win rate in 1234 games");
        expect(content).toContain("52.0% in 5000 games");
        expect(content).toContain("50.0% in 8000 games");
    });

    test("says matchup data is missing instead of inventing it", () => {
        const { content } = buildMatchupContext(input({ matchup: undefined }));
        expect(content).toContain("Matchup statistics: not available");
        expect(
            buildMatchupContext(input({ matchup: { games: 0, wins: 0 } }))
                .content,
        ).toContain("Matchup statistics: not available");
    });

    test("includes the player record only when present", () => {
        expect(buildMatchupContext(input()).content).toContain(
            "no personal record",
        );
        const { content } = buildMatchupContext(
            input({
                player: {
                    games: 12,
                    wins: 7,
                    kda: 3.21,
                    csPerMin: 6.84,
                },
            }),
        );
        expect(content).toContain("12 games, 7 wins (58.3%)");
        expect(content).toContain("KDA 3.2");
        expect(content).toContain("CS/min 6.8");
        expect(content).not.toContain("no personal record");
    });

    test("champ select has no other champions, in game lists them", () => {
        const select = buildMatchupContext(input()).content;
        expect(select).toContain("champ-select");
        expect(select).not.toContain("Other champions in the game");

        const game = buildMatchupContext(
            input({
                phase: "in-game",
                others: {
                    allies: [{ championName: "Jinx", role: "Bottom" }],
                    enemies: [{ championName: "Lee Sin", role: "Jungle" }],
                },
            }),
        ).content;
        expect(game).toContain("in-game");
        expect(game).toContain("Allies: Jinx (Bottom)");
        expect(game).toContain("Enemies: Lee Sin (Jungle)");
    });

    test("states the response language", () => {
        expect(buildMatchupContext(input()).content).toContain(
            "Answer in Spanish",
        );
        expect(
            buildMatchupContext(input({ responseLanguage: "English" })).content,
        ).toContain("Answer in English");
    });

    test("S8 and grounding instructions are present", () => {
        const { content } = buildMatchupContext(input());
        expect(content).toContain("Present options");
        expect(content).toContain("never a single command");
        expect(content).toContain("Use only the numbers supplied");
        expect(content).toContain("about 200 words");
        expect(content).toContain("hidden information");
        expect(content).toContain("uncertain");
    });

    test("is deterministic", () => {
        expect(buildMatchupContext(input())).toEqual(
            buildMatchupContext(input()),
        );
    });
});

describe("matchupStatsFor", () => {
    const dataset: any = {
        championData: {
            "45": {
                statsByRole: {
                    2: {
                        wins: 10,
                        games: 20,
                        matchup: { 2: { "103": { wins: 6, games: 11 } } },
                    },
                },
            },
        },
    };
    test("reads overall and matchup stats through getStats", () => {
        const stats = matchupStatsFor(dataset, "45", 2, "103", 2);
        expect(stats.matchup).toEqual({ wins: 6, games: 11 });
        expect(stats.mine).toEqual({ wins: 10, games: 20 });
        expect(stats.theirs).toEqual({ wins: 0, games: 0 });
    });
});

describe("history", () => {
    test("appendTurn is immutable and ignores blank content", () => {
        const a: never[] = [];
        const b = appendTurn(a, "user", " hola ");
        expect(a).toEqual([]);
        expect(b).toEqual([{ role: "user", content: "hola" }]);
        expect(appendTurn(b, "assistant", "   ")).toBe(b);
    });

    const context = buildMatchupContext(input());
    const turns = (n: number, size = 10) =>
        Array.from({ length: n }, (_, i) => ({
            role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
            content: `${i}`.padEnd(size, "x"),
        }));

    test("keeps the system message first and all turns when within budget", () => {
        const messages = toChatMessages(context, turns(3), 10);
        expect(messages[0]).toEqual(context);
        expect(messages).toHaveLength(4);
    });

    test("trims old turns by count", () => {
        const history = turns(9); // ends with a user message (index 8)
        const messages = toChatMessages(context, history, 4);
        expect(messages[0]).toEqual(context);
        // Index 5 is an assistant turn and would lead the history: dropped.
        expect(messages.slice(1).map((m) => m.content[0])).toEqual([
            "6",
            "7",
            "8",
        ]);
    });

    test("trims old turns by total characters", () => {
        const history = turns(9, 100);
        const messages = toChatMessages(context, history, 20, 350);
        const kept = messages.slice(1);
        expect(kept.length).toBe(3);
        expect(kept[kept.length - 1].content).toBe(history[8].content);
        expect(kept[0].role).toBe("user");
    });

    test("never drops the latest user message, even over budget", () => {
        const history = [
            ...turns(4),
            { role: "user" as const, content: "y".repeat(5000) },
        ];
        const messages = toChatMessages(context, history, 1, 100);
        expect(messages).toHaveLength(2);
        expect(messages[1].content).toBe("y".repeat(5000));
    });

    test("starts the kept history with a user message", () => {
        const history = turns(6); // ends with assistant (index 5)
        const messages = toChatMessages(context, history, 3);
        expect(messages[1].role).toBe("user");
        expect(messages[messages.length - 1]).toEqual(history[5]);
    });
});

describe("suggestedQuestions", () => {
    test("returns 3-4 message keys per phase", () => {
        for (const phase of ["champ-select", "in-game"] as const) {
            const keys = suggestedQuestions(phase);
            expect(keys.length).toBeGreaterThanOrEqual(3);
            expect(keys.length).toBeLessThanOrEqual(4);
            expect(keys.every((k) => k.startsWith("matchupChat."))).toBe(true);
        }
        expect(suggestedQuestions("in-game")).not.toEqual(
            suggestedQuestions("champ-select"),
        );
    });
});
