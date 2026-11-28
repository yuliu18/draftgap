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
        matchupRating: 0,
        winrate: 0.5,
        lowConfidence: false,
    },
    alternatives: [],
});

const full: RecommendedBuild = {
    championKey: "103",
    role: 2,
    enemies: 0,
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
                blocks: [
                    { kind: "start", items: [1056, 2003] },
                    { kind: "boots", items: [3020] },
                    { kind: "core", items: [6655, 3157] },
                ],
            },
        });
    });

    test("alternatives of boots and of every core slot are written, without repeats or core items", () => {
        const withAlternatives = (value: number, alternatives: number[]) => ({
            ...slot(value),
            alternatives: alternatives.map((v) => slot(v).choice),
        });
        const result = toClientImportInputs({
            ...full,
            startingItems: slot([1056, 2003, 2003]),
            boots: withAlternatives(3020, [3158]),
            coreItems: [
                withAlternatives(6655, [3157, 4645]),
                withAlternatives(3157, [4645, 3089]),
            ],
        });
        expect(result.items).toEqual({
            blocks: [
                { kind: "start", items: [1056, 2003, 2003] },
                { kind: "boots", items: [3020, 3158] },
                { kind: "core", items: [6655, 3157] },
                { kind: "alternatives", items: [4645, 3089] },
            ],
        });
    });

    test("situational armor and magic resist items become their own blocks, the enemy focus first", () => {
        const pick = (value: number) => ({
            value,
            wins: 1,
            games: 2,
            rawWinrate: 0.5,
        });
        const situational = {
            armor: [pick(3075), pick(3110)],
            magicResist: [pick(2504)],
        };
        const kinds = (focus: "magic" | "physical" | "mixed" | "unknown") =>
            toClientImportInputs(full, {
                ...situational,
                focus,
            }).items!.blocks.map((b) => b.kind);
        expect(kinds("magic")).toEqual([
            "start",
            "boots",
            "core",
            "magicResist",
            "armor",
        ]);
        expect(kinds("physical").slice(3)).toEqual(["armor", "magicResist"]);
        expect(kinds("mixed").slice(3)).toEqual(["armor", "magicResist"]);
        expect(
            toClientImportInputs(full, {
                armor: [],
                magicResist: [pick(2504)],
                focus: "unknown",
            }).items!.blocks.slice(3),
        ).toEqual([{ kind: "magicResist", items: [2504] }]);
    });

    test("a situational item already listed as boots, core or alternative is not repeated", () => {
        const pick = (value: number) => ({
            value,
            wins: 1,
            games: 2,
            rawWinrate: 0.5,
        });
        const result = toClientImportInputs(
            {
                ...full,
                coreItems: [
                    {
                        ...slot(6655),
                        alternatives: [slot(3075).choice, slot(2504).choice],
                    },
                ],
            },
            {
                armor: [pick(3075), pick(3110), pick(6655)],
                magicResist: [pick(2504)],
                focus: "physical",
            },
        );
        expect(result.items!.blocks.slice(2)).toEqual([
            { kind: "core", items: [6655] },
            { kind: "alternatives", items: [3075, 2504] },
            { kind: "armor", items: [3110] },
        ]);
    });

    test("situational items alone do not make an item set", () => {
        const result = toClientImportInputs(
            {
                ...full,
                startingItems: undefined,
                boots: undefined,
                coreItems: [],
            },
            {
                armor: [{ value: 3075, wins: 1, games: 2, rawWinrate: 0.5 }],
                magicResist: [],
                focus: "physical",
            },
        );
        expect(result.items).toBeUndefined();
    });

    test("omits runes when the page is incomplete, keeps items", () => {
        const build = {
            ...full,
            runes: { ...full.runes!, shards: full.runes!.shards.slice(0, 2) },
        };
        const result = toClientImportInputs(build);
        expect(result.runes).toBeUndefined();
        expect(result.items?.blocks.at(-1)).toEqual({
            kind: "core",
            items: [6655, 3157],
        });
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
            ...full,
            startingItems: undefined,
            boots: undefined,
            coreItems: [],
        });
        expect(result.items).toBeUndefined();
        expect(result.runes).toBeDefined();
    });

    test("returns nothing importable for an empty build", () => {
        expect(
            toClientImportInputs({
                ...full,
                runes: undefined,
                startingItems: undefined,
                boots: undefined,
                coreItems: [],
            }),
        ).toEqual({});
    });
});
