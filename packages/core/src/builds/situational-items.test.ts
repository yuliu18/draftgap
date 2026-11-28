import { describe, expect, test } from "bun:test";
import {
    enemyDamageFocus,
    mapItemDefenseTags,
    situationalItems,
} from "./situational-items";

const s = (wins: number, games: number) => ({ wins, games });

const tags = mapItemDefenseTags({
    data: {
        "3075": { tags: ["Armor", "Health"] },
        "3110": { tags: ["Armor", "Mana"] },
        "3143": { tags: ["Armor", "Health"] },
        "6665": { tags: ["Armor", "SpellBlock"] },
        "2504": { tags: ["SpellBlock", "Health"] },
        "4401": { tags: ["SpellBlock"] },
        "3190": { tags: ["Health"] },
        "3047": { tags: ["Armor", "Boots"] },
        bad: { tags: ["Armor"] },
        "9": { tags: "Armor" },
    },
});

describe("mapItemDefenseTags", () => {
    test("keeps only numeric ids with an Armor or SpellBlock tag", () => {
        expect(tags).toEqual({
            3075: { armor: true, magicResist: false },
            3110: { armor: true, magicResist: false },
            3143: { armor: true, magicResist: false },
            6665: { armor: true, magicResist: true },
            2504: { armor: false, magicResist: true },
            4401: { armor: false, magicResist: true },
            3047: { armor: true, magicResist: false },
        });
        expect(mapItemDefenseTags(undefined)).toEqual({});
        expect(mapItemDefenseTags({ data: [] })).toEqual({});
    });
});

describe("enemyDamageFocus", () => {
    test("60% or more of the non-true damage decides the focus", () => {
        expect(
            enemyDamageFocus({ magic: 60, physical: 40, true: 500 }),
        ).toEqual({
            focus: "magic",
            magicShare: 0.6,
        });
        expect(enemyDamageFocus({ magic: 40, physical: 60, true: 0 })).toEqual({
            focus: "physical",
            magicShare: 0.4,
        });
        expect(
            enemyDamageFocus({ magic: 59, physical: 41, true: 0 }).focus,
        ).toBe("mixed");
    });

    test("no known enemy damage has no focus", () => {
        expect(enemyDamageFocus({ magic: 0, physical: 0, true: 0 })).toEqual({
            focus: "unknown",
            magicShare: undefined,
        });
        expect(enemyDamageFocus(undefined).focus).toBe("unknown");
    });
});

describe("situationalItems", () => {
    // 10000 champion games: an item needs 100 games over all orders.
    const statsByOrder = [
        { 3190: s(500, 1000), 3075: s(20, 40) },
        { 3075: s(200, 400), 2504: s(100, 200), 3047: s(300, 600) },
        {
            3110: s(60, 120),
            4401: s(30, 50),
            6665: s(90, 150),
            3143: s(50, 99),
        },
        { 4401: s(30, 60), 3143: s(1, 1), 3075: s(5, 10) },
    ];

    test("lists the champion's own armor and magic resist items, most played first", () => {
        const result = situationalItems(statsByOrder, 10000, tags, {
            exclude: [],
            boots: [3047],
        });
        // 3075: 450 games, 6665: 150, 3110: 120, 3143: 100 -> top three.
        expect(result.armor.map((c) => c.value)).toEqual([3075, 6665, 3110]);
        expect(result.armor[0]).toEqual({
            value: 3075,
            wins: 225,
            games: 450,
            rawWinrate: 0.5,
        });
        // 2504: 200, 6665: 150, 4401: 110.
        expect(result.magicResist.map((c) => c.value)).toEqual([
            2504, 6665, 4401,
        ]);
    });

    test("items already in the build, boots and rarely built items are left out", () => {
        const result = situationalItems(statsByOrder, 20000, tags, {
            exclude: [3075],
            boots: [3047],
        });
        // 20000 games: the bar is 200 games.
        expect(result.armor).toEqual([]);
        expect(result.magicResist.map((c) => c.value)).toEqual([2504]);
    });

    test("no tags or no statistics give empty lists", () => {
        const none = { armor: [], magicResist: [] };
        expect(
            situationalItems(
                statsByOrder,
                10000,
                {},
                { exclude: [], boots: [] },
            ),
        ).toEqual(none);
        expect(
            situationalItems(undefined, 10000, tags, {
                exclude: [],
                boots: [],
            }),
        ).toEqual(none);
        expect(
            situationalItems(statsByOrder, 0, tags, { exclude: [], boots: [] }),
        ).toEqual(none);
    });
});
