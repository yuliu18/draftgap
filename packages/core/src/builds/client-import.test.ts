import { describe, expect, test } from "bun:test";
import { RecommendedBuild, BuildSlot } from "./recommended-build";
import { toClientImportInputs } from "./client-import";

const slot = <T>(value: T): BuildSlot<T> => ({
    choice: {
        value,
        wins: 1,
        games: 2,
        rawWinrate: 0.5,
        rating: 0,
        winrate: 0.5,
        lowConfidence: false,
    },
    alternatives: [],
});

const full: RecommendedBuild = {
    runes: {
        primaryPathId: 8000,
        primary: [8005, 9111, 9104, 8014].map(slot),
        secondaryPathId: 8100,
        secondary: [8138, 8135].map(slot),
        shards: [5005, 5008, 5001].map(slot),
    },
    startingItems: slot([1056, 2003]),
    boots: slot(3020),
    coreItems: [6655, 3157].map(slot),
};

describe("toClientImportInputs", () => {
    test("maps a complete build to rune and item inputs", () => {
        expect(toClientImportInputs(full)).toEqual({
            runes: {
                primaryStyleId: 8000,
                subStyleId: 8100,
                perkIds: [8005, 9111, 9104, 8014, 8138, 8135, 5005, 5008, 5001],
            },
            items: {
                startingItems: [1056, 2003],
                boots: 3020,
                coreItems: [6655, 3157],
            },
        });
    });

    test("omits runes when the page is incomplete, keeps items", () => {
        const build = {
            ...full,
            runes: { ...full.runes!, shards: full.runes!.shards.slice(0, 2) },
        };
        const result = toClientImportInputs(build);
        expect(result.runes).toBeUndefined();
        expect(result.items?.coreItems).toEqual([6655, 3157]);
    });

    test("omits runes with non-positive ids", () => {
        const build = {
            ...full,
            runes: { ...full.runes!, secondaryPathId: 0 },
        };
        expect(toClientImportInputs(build).runes).toBeUndefined();
    });

    test("omits items when there are none", () => {
        const result = toClientImportInputs({
            runes: full.runes,
            coreItems: [],
        });
        expect(result.items).toBeUndefined();
        expect(result.runes).toBeDefined();
    });

    test("returns nothing importable for an empty build", () => {
        expect(toClientImportInputs({ coreItems: [] })).toEqual({});
    });
});
