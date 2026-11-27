import { describe, expect, test } from "bun:test";
import { personalizeSuggestions } from "./personalize";
import { buildPersonalStats, emptyPersonalStats } from "./personal-stats";
import { DEFAULT_PERSONAL_CONFIG } from "./personal-rating";
import { Role } from "../models/Role";
import { Suggestion } from "../draft/suggestions";
import { DraftResult } from "../draft/analysis";
import { ratingToWinrate, winrateToRating } from "../rating/ratings";

const config = { ...DEFAULT_PERSONAL_CONFIG, enabled: true };

function suggestion(
    championKey: string,
    role: Role,
    winrate: number,
): Suggestion {
    return {
        championKey,
        role,
        draftResult: {
            winrate,
            totalRating: winrateToRating(winrate),
        } as DraftResult,
    };
}

const suggestions = [
    suggestion("Top1", Role.Middle, 0.56),
    suggestion("Top2", Role.Middle, 0.54),
    suggestion("Mine", Role.Middle, 0.52),
    suggestion("Sup", Role.Support, 0.51),
];

function history(champ: string, role: Role, wins: number, losses: number) {
    return [
        ...Array.from({ length: wins }, (_, i) => ({
            championKey: champ,
            role,
            win: true,
            timestamp: i,
        })),
        ...Array.from({ length: losses }, (_, i) => ({
            championKey: champ,
            role,
            win: false,
            timestamp: 100 + i,
        })),
    ];
}

const strong = buildPersonalStats([
    ...history("Mine", Role.Middle, 30, 5),
    ...history("Other", Role.Middle, 5, 30),
]);

function expectIdentity(result: ReturnType<typeof personalizeSuggestions>) {
    expect(result.map((s) => s.championKey)).toEqual(
        suggestions.map((s) => s.championKey),
    );
    result.forEach((s, i) => {
        expect(s.personal).toBeUndefined();
        expect(s.personalRating).toBe(suggestions[i]!.draftResult.totalRating);
        expect(s.personalWinrate).toBe(suggestions[i]!.draftResult.winrate);
    });
}

describe("personalizeSuggestions", () => {
    test("identity when disabled", () => {
        expectIdentity(
            personalizeSuggestions(suggestions, strong, {
                ...config,
                enabled: false,
            }),
        );
    });

    test("identity when stats are undefined", () => {
        expectIdentity(personalizeSuggestions(suggestions, undefined, config));
    });

    test("identity when stats have no games", () => {
        expectIdentity(
            personalizeSuggestions(suggestions, emptyPersonalStats(), config),
        );
    });

    test("strong history on a lower-ranked pick changes the order", () => {
        const result = personalizeSuggestions(suggestions, strong, config);
        expect(result[0]!.championKey).toBe("Mine");
        const mine = result[0]!;
        expect(mine.personal).toBeDefined();
        expect(mine.personalRating).toBeCloseTo(
            mine.draftResult.totalRating + mine.personal!.rating,
            10,
        );
        expect(mine.personalWinrate).toBeCloseTo(
            ratingToWinrate(mine.personalRating),
            10,
        );
        for (let i = 1; i < result.length; i++) {
            expect(result[i - 1]!.personalWinrate).toBeGreaterThanOrEqual(
                result[i]!.personalWinrate,
            );
        }
    });

    test("only suggestions in the given roles are personalized", () => {
        const stats = buildPersonalStats([
            ...history("Mine", Role.Middle, 30, 5),
            ...history("Sup", Role.Support, 8, 2),
        ]);
        const result = personalizeSuggestions(
            suggestions,
            stats,
            config,
            new Set([Role.Support]),
        );
        const mid = result.filter((s) => s.role === Role.Middle);
        expect(mid.every((s) => s.personal === undefined)).toBe(true);
        expect(mid.map((s) => s.championKey)).toEqual(["Top1", "Top2", "Mine"]);
        expect(
            result.find((s) => s.role === Role.Support)!.personal,
        ).toBeDefined();
    });

    test("a selected role with no history keeps the input order and values", () => {
        const input = [
            suggestion("Sup", Role.Support, 0.51),
            suggestion("OtherSup", Role.Support, 0.55),
        ];
        const result = personalizeSuggestions(
            input,
            strong,
            config,
            new Set([Role.Support]),
        );
        expect(result).toEqual(
            input.map((s) => ({
                ...s,
                personal: undefined,
                personalRating: s.draftResult.totalRating,
                personalWinrate: s.draftResult.winrate,
            })),
        );
    });

    test("omitted roles default to roles the player has played", () => {
        const result = personalizeSuggestions(suggestions, strong, config);
        expect(
            result.find((s) => s.championKey === "Sup")!.personal,
        ).toBeUndefined();
        expect(
            result
                .filter((s) => s.role === Role.Middle)
                .every((s) => s.personal !== undefined),
        ).toBe(true);
    });

    test("does not mutate inputs and shares draftResult by reference", () => {
        const input = suggestions.map((s) => ({ ...s }));
        const snapshot = structuredClone(input);
        const result = personalizeSuggestions(input, strong, config);
        expect(input).toEqual(snapshot);
        expect(input.map((s) => s.championKey)).toEqual(
            snapshot.map((s) => s.championKey),
        );
        for (const r of result) {
            const original = input.find(
                (s) => s.championKey === r.championKey,
            )!;
            expect(r.draftResult).toBe(original.draftResult);
        }
    });
});
