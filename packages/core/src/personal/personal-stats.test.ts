import { describe, expect, test } from "bun:test";
import {
    buildPersonalStats,
    emptyPersonalStats,
    personalPickKey,
} from "./personal-stats";
import { Role } from "../models/Role";

const match = (
    championKey: string,
    role: Role,
    win: boolean,
    timestamp: number,
) => ({ championKey, role, win, timestamp });

describe("buildPersonalStats", () => {
    test("no matches gives the empty stats", () => {
        const stats = buildPersonalStats([]);
        expect(stats).toEqual(emptyPersonalStats());
        expect(stats.games).toBe(0);
        expect(stats.wins).toBe(0);
        expect(stats.byPick).toEqual({});
        expect(stats.recent).toEqual({ games: 0, wins: 0 });
        expect(stats.gamesByRole).toEqual({ 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 });
    });

    test("aggregates by pick, role and totals", () => {
        const stats = buildPersonalStats([
            match("Ahri", Role.Middle, true, 1),
            match("Ahri", Role.Middle, false, 3),
            match("Ahri", Role.Support, true, 2),
        ]);
        expect(stats.games).toBe(3);
        expect(stats.wins).toBe(2);
        expect(stats.gamesByRole[Role.Middle]).toBe(2);
        expect(stats.gamesByRole[Role.Support]).toBe(1);
        expect(stats.byPick[personalPickKey("Ahri", Role.Middle)]).toEqual({
            championKey: "Ahri",
            role: Role.Middle,
            games: 2,
            wins: 1,
            lastPlayed: 3,
            recent: { games: 2, weightedWins: 9, weight: 19 },
        });
        expect(personalPickKey("Ahri", Role.Middle)).toBe(
            `Ahri:${Role.Middle}`,
        );
    });

    test("each pick uses its latest ten games independently of overall recent games", () => {
        const stats = buildPersonalStats([
            match("A", Role.Top, true, 0),
            ...Array.from({ length: 10 }, (_, i) =>
                match("A", Role.Top, false, i + 1),
            ),
            ...Array.from({ length: 20 }, (_, i) =>
                match("A", Role.Middle, true, i + 11),
            ),
        ]);
        expect(stats.byPick[personalPickKey("A", Role.Top)]?.recent).toEqual({
            games: 10,
            weightedWins: 0,
            weight: 55,
        });
        expect(stats.recent).toEqual({ games: 20, wins: 20 });
    });

    test("recent window larger than the match count uses all matches", () => {
        const stats = buildPersonalStats([
            match("A", Role.Top, true, 1),
            match("A", Role.Top, false, 2),
        ]);
        expect(stats.recent).toEqual({ games: 2, wins: 1 });
    });

    test("recent window smaller than the match count keeps the latest by timestamp", () => {
        const stats = buildPersonalStats(
            [
                match("A", Role.Top, true, 1),
                match("A", Role.Top, true, 4),
                match("A", Role.Top, false, 3),
                match("A", Role.Top, false, 2),
            ],
            { recentGames: 2 },
        );
        expect(stats.recent).toEqual({ games: 2, wins: 1 });
        expect(stats.games).toBe(4);
    });
});
