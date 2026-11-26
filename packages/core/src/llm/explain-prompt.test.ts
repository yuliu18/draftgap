import { describe, expect, test } from "bun:test";
import {
    ExplainInput,
    ExplainOption,
    buildExplainMessages,
    canExplain,
    extractExplanation,
} from "./explain-prompt";

const option = (name: string, extra: Partial<ExplainOption> = {}) => ({
    championName: name,
    role: "Middle",
    winrate: 0.5234,
    championRating: 12.4,
    duoRating: -3.6,
    matchupRating: 7.5,
    ...extra,
});

const input = (options: ExplainOption[], extra: Partial<ExplainInput> = {}) =>
    ({
        allyPicks: [{ championName: "Ornn", role: "Top" }],
        enemyPicks: [{ championName: "Jax", role: "Top" }],
        pickingRole: "Middle",
        options,
        responseLanguage: "Spanish",
        ...extra,
    }) satisfies ExplainInput;

describe("canExplain", () => {
    test("false with zero options", () => {
        expect(canExplain(input([]))).toBe(false);
    });
    test("true with one option", () => {
        expect(canExplain(input([option("Ahri")]))).toBe(true);
    });
});

describe("buildExplainMessages", () => {
    test("returns a system message then a user message", () => {
        const m = buildExplainMessages(input([option("Ahri"), option("Zed")]));
        expect(m.map((x) => x.role)).toEqual(["system", "user"]);
    });

    test("system message carries the rules and the response language", () => {
        const system = buildExplainMessages(
            input([option("Ahri"), option("Zed")]),
        )[0].content;
        expect(system).toContain("only the numbers");
        expect(system).toContain("Compare");
        expect(system).toContain("at least two alternatives");
        expect(system).toContain("Never tell the player to pick one");
        expect(system).toContain("Spanish");
        expect(system).toContain("150 words");
    });

    test("user message lists teams and every option with formatted numbers", () => {
        const user = buildExplainMessages(
            input(
                [
                    option("Ahri", {
                        personalMastery: 4.4,
                        personalFamiliarity: -12.6,
                        personalGames: 8,
                        personalWins: 5,
                    }),
                    option("Zed"),
                ],
                {
                    personal: {
                        overall: { games: 100, wins: 55 },
                        recent: { games: 20, wins: 9 },
                    },
                },
            ),
        )[1].content;
        expect(user).toContain("Ornn (Top)");
        expect(user).toContain("Jax (Top)");
        expect(user).toContain("Role being picked: Middle");
        expect(user).toContain("Ahri (Middle)");
        expect(user).toContain("Zed (Middle)");
        expect(user).toContain("winrate 52.3%");
        expect(user).toContain("champion 12");
        expect(user).toContain("duos -4");
        expect(user).toContain("matchups 8");
        expect(user).toContain("mastery 4");
        expect(user).toContain("familiarity -13");
        expect(user).toContain("5 wins in 8 games");
        expect(user).toContain("Overall: 55 wins in 100 games");
        expect(user).toContain("Recent: 9 wins in 20 games");
    });

    test("missing personal data is stated, not invented", () => {
        const user = buildExplainMessages(input([option("Ahri")]))[1].content;
        expect(user).toContain("no personal data");
        expect(user).not.toContain("mastery");
        expect(user).not.toContain("Overall:");
    });

    test("empty teams and unknown role are handled", () => {
        const user = buildExplainMessages(
            input([option("Ahri")], {
                allyPicks: [],
                enemyPicks: [],
                pickingRole: undefined,
            }),
        )[1].content;
        expect(user).toContain("Allies: none yet");
        expect(user).toContain("Enemies: none yet");
        expect(user).not.toContain("Role being picked");
    });

    test("default maxOptions is 5, in input order", () => {
        const names = ["A", "B", "C", "D", "E", "F", "G"];
        const user = buildExplainMessages(input(names.map((n) => option(n))))[1]
            .content;
        for (const n of names.slice(0, 5)) expect(user).toContain(`${n} (`);
        expect(user).not.toContain("F (");
        expect(user).not.toContain("G (");
        expect(user.indexOf("A (")).toBeLessThan(user.indexOf("B ("));
    });

    test("explicit maxOptions is respected", () => {
        const user = buildExplainMessages(
            input([option("A"), option("B"), option("C")], { maxOptions: 2 }),
        )[1].content;
        expect(user).toContain("B (");
        expect(user).not.toContain("C (");
    });

    test("exactly maxOptions options are all kept", () => {
        const opts = ["A", "B", "C", "D", "E"].map((n) => option(n));
        const user = buildExplainMessages(input(opts))[1].content;
        expect(user).toContain("E (");
    });

    test("single option is still built (caller decides to send)", () => {
        const m = buildExplainMessages(input([option("Ahri")]));
        expect(m[1].content).toContain("Ahri (");
    });

    test("zero options asks for nothing", () => {
        const m = buildExplainMessages(input([]));
        expect(m.map((x) => x.role)).toEqual(["system", "user"]);
        expect(m[1].content).toContain("No options");
        expect(m[1].content).not.toContain("Explain");
    });

    test("deterministic", () => {
        const i = input([option("Ahri"), option("Zed")]);
        expect(buildExplainMessages(i)).toEqual(buildExplainMessages(i));
    });
});

describe("extractExplanation", () => {
    const ok = (content: unknown) => ({ choices: [{ message: { content } }] });

    test("returns trimmed content", () => {
        expect(extractExplanation(ok("  hola \n"))).toBe("hola");
    });
    test("throws on non-object", () => {
        expect(() => extractExplanation(null)).toThrow(/unexpected/i);
        expect(() => extractExplanation("x")).toThrow(/unexpected/i);
    });
    test("throws on missing choices", () => {
        expect(() => extractExplanation({})).toThrow(/choices/);
        expect(() => extractExplanation({ choices: [] })).toThrow(/choices/);
    });
    test("throws on missing content", () => {
        expect(() =>
            extractExplanation({ choices: [{ message: {} }] }),
        ).toThrow(/content/);
        expect(() => extractExplanation(ok(42))).toThrow(/content/);
    });
    test("throws on empty content after trim", () => {
        expect(() => extractExplanation(ok("  \n "))).toThrow(/empty/);
    });
    test("throws with the error message when response has error", () => {
        expect(() =>
            extractExplanation({ error: { message: "model not found" } }),
        ).toThrow("model not found");
    });
    test("error object without message still throws readable error", () => {
        expect(() => extractExplanation({ error: {} })).toThrow(/error/i);
    });
});
