import { describe, expect, test } from "bun:test";
import {
    ddragonNamesUrls,
    localizedName,
    mapChampionNames,
    mapItemNames,
    mapRuneNames,
    mapSummonerSpellNames,
} from "./ddragon-names";

describe("ddragonNamesUrls", () => {
    test("builds the four Data Dragon urls for a version and locale", () => {
        expect(ddragonNamesUrls("14.1.1", "es_ES")).toEqual({
            champions:
                "https://ddragon.leagueoflegends.com/cdn/14.1.1/data/es_ES/champion.json",
            items: "https://ddragon.leagueoflegends.com/cdn/14.1.1/data/es_ES/item.json",
            runes: "https://ddragon.leagueoflegends.com/cdn/14.1.1/data/es_ES/runesReforged.json",
            summonerSpells:
                "https://ddragon.leagueoflegends.com/cdn/14.1.1/data/es_ES/summoner.json",
        });
    });
});

describe("mapChampionNames", () => {
    test("maps champion key to name and skips entries without a usable name", () => {
        const json = {
            data: {
                MonkeyKing: { id: "MonkeyKing", key: "62", name: "Wukong" },
                Lux: { id: "Lux", key: "99", name: "Lux" },
                Broken: { id: "Broken", key: "1" },
                NoKey: { id: "NoKey", name: "Sin clave" },
                Empty: { id: "Empty", key: "2", name: "" },
            },
        };
        expect(mapChampionNames(json)).toEqual({ "62": "Wukong", "99": "Lux" });
    });

    test("returns an empty map for malformed input", () => {
        expect(mapChampionNames(undefined)).toEqual({});
        expect(mapChampionNames(null)).toEqual({});
        expect(mapChampionNames({})).toEqual({});
        expect(mapChampionNames({ data: [] })).toEqual({});
        expect(mapChampionNames("x")).toEqual({});
    });
});

describe("mapItemNames", () => {
    test("maps item id to name", () => {
        const json = {
            data: {
                "1001": { name: "Botas" },
                "3031": { name: "Filo del Infinito" },
                "9999": {},
            },
        };
        expect(mapItemNames(json)).toEqual({
            "1001": "Botas",
            "3031": "Filo del Infinito",
        });
    });

    test("returns an empty map for malformed input", () => {
        expect(mapItemNames({ data: null })).toEqual({});
    });
});

describe("mapRuneNames", () => {
    test("maps runes and paths separately by numeric id", () => {
        const json = [
            {
                id: 8100,
                name: "Dominación",
                slots: [
                    {
                        runes: [
                            { id: 8112, name: "Electrocutar" },
                            { id: 8128 },
                        ],
                    },
                    { runes: [{ id: 8126, name: "Golpe repentino" }] },
                ],
            },
            { id: 8200, name: "Hechicería" },
            { name: "sin id", slots: [] },
        ];
        expect(mapRuneNames(json)).toEqual({
            paths: { "8100": "Dominación", "8200": "Hechicería" },
            runes: { "8112": "Electrocutar", "8126": "Golpe repentino" },
        });
    });

    test("returns empty maps for malformed input", () => {
        expect(mapRuneNames({})).toEqual({ paths: {}, runes: {} });
        expect(mapRuneNames(undefined)).toEqual({ paths: {}, runes: {} });
    });
});

describe("mapSummonerSpellNames", () => {
    test("maps spell key to name", () => {
        const json = {
            data: {
                SummonerFlash: { key: "4", name: "Destello" },
                SummonerHeal: { key: "7", name: "Curar" },
                SummonerBad: { name: "Sin clave" },
            },
        };
        expect(mapSummonerSpellNames(json)).toEqual({
            "4": "Destello",
            "7": "Curar",
        });
    });
});

describe("localizedName", () => {
    test("returns the localized name when present", () => {
        expect(localizedName({ "62": "Wukong" }, 62, "Wukong EN")).toBe(
            "Wukong",
        );
    });

    test("falls back to the English name when the map or entry is missing", () => {
        expect(localizedName({ "1": "x" }, 62, "Wukong")).toBe("Wukong");
        expect(localizedName(undefined, 62, "Wukong")).toBe("Wukong");
    });
});
