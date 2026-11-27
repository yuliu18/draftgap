import { describe, expect, test } from "bun:test";
import { buildPersonalStats } from "./personal-stats";
import { DEFAULT_PERSONAL_CONFIG, getPersonalRating } from "./personal-rating";
import { Role } from "../models/Role";
import { winrateToRating } from "../rating/ratings";

const config = { ...DEFAULT_PERSONAL_CONFIG, enabled: true };

function games(champ: string, role: Role, wins: number, losses: number) {
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
            timestamp: 1000 + i,
        })),
    ];
}

describe("getPersonalRating", () => {
    test("defaults", () => {
        expect(DEFAULT_PERSONAL_CONFIG.priorGames).toBe(20);
        expect(DEFAULT_PERSONAL_CONFIG.unfamiliarPenalty).toBe(30);
        expect(DEFAULT_PERSONAL_CONFIG.familiarGames).toBe(10);
    });

    test("no matches: only the unfamiliarity penalty applies", () => {
        const r = getPersonalRating(
            buildPersonalStats([]),
            "Ahri",
            Role.Middle,
            config,
        );
        expect(r.masteryRating).toBeCloseTo(0, 10);
        expect(r.familiarityRating).toBe(-30);
        expect(r.rating).toBeCloseTo(-30, 10);
        expect(r.games).toBe(0);
        expect(r.wins).toBe(0);
    });

    test("pick with 0 games has zero mastery and full penalty", () => {
        const stats = buildPersonalStats(games("Zed", Role.Middle, 6, 4));
        const r = getPersonalRating(stats, "Ahri", Role.Middle, config);
        expect(r.masteryRating).toBeCloseTo(0, 10);
        expect(r.familiarityRating).toBe(-30);
        expect(r.rating).toBeCloseTo(-30, 10);
    });

    test("familiarGames 0 keeps an unplayed pick's rating finite", () => {
        const stats = buildPersonalStats(games("Zed", Role.Middle, 6, 4));
        const rating = getPersonalRating(stats, "Ahri", Role.Middle, {
            ...config,
            familiarGames: 0,
        });
        expect(Number.isFinite(rating.rating)).toBe(true);
        expect(rating).toEqual({
            rating: -30,
            masteryRating: 0,
            familiarityRating: -30,
            games: 0,
            wins: 0,
        });
    });

    test("priorGames below 1 is clamped to one game", () => {
        const stats = buildPersonalStats([
            ...games("Ahri", Role.Middle, 1, 0),
            ...games("Zed", Role.Middle, 0, 1),
        ]);
        const expected = getPersonalRating(stats, "Ahri", Role.Middle, {
            ...config,
            priorGames: 1,
        });
        for (const priorGames of [0, -1, 0.5]) {
            expect(
                getPersonalRating(stats, "Ahri", Role.Middle, {
                    ...config,
                    priorGames,
                }),
            ).toEqual(expected);
        }
    });

    test("pick at exactly familiarGames has no penalty", () => {
        const stats = buildPersonalStats(games("Ahri", Role.Middle, 5, 5));
        const r = getPersonalRating(stats, "Ahri", Role.Middle, config);
        expect(r.games).toBe(10);
        expect(Math.abs(r.familiarityRating)).toBe(0);
        expect(r.rating).toBeCloseTo(r.masteryRating, 10);
    });

    test("mastery follows the shrunk winrate against the baseline", () => {
        const stats = buildPersonalStats([
            ...games("Ahri", Role.Middle, 10, 0),
            ...games("Zed", Role.Middle, 0, 10),
        ]);
        const r = getPersonalRating(stats, "Ahri", Role.Middle, config);
        const shrunk = (10 + 20 * 0.5) / (10 + 20);
        expect(r.masteryRating).toBeCloseTo(
            winrateToRating(shrunk) - winrateToRating(0.5),
            8,
        );
        expect(r.masteryRating).toBeGreaterThan(0);
    });

    test("baseline 0% and 100% give finite outputs", () => {
        for (const [w, l] of [
            [0, 12],
            [12, 0],
        ] as const) {
            const stats = buildPersonalStats(games("Ahri", Role.Middle, w, l));
            for (const key of ["Ahri", "Zed"]) {
                const r = getPersonalRating(stats, key, Role.Middle, config);
                for (const v of Object.values(r)) {
                    expect(Number.isFinite(v)).toBe(true);
                }
            }
        }
    });
});
