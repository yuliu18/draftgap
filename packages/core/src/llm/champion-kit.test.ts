import { describe, expect, test } from "bun:test";
import {
    championKitUrl,
    createChampionKitLoader,
    formatChampionKit,
    mapChampionKit,
} from "./champion-kit";
import veigar from "./__fixtures__/Veigar.es_ES.json";
import ahri from "./__fixtures__/Ahri.es_ES.json";

describe("mapChampionKit", () => {
    test("maps passive and Q/W/E/R in order", () => {
        const kit = mapChampionKit(veigar)!;
        expect(kit.id).toBe("Veigar");
        expect(kit.name).toBe("Veigar");
        expect(kit.abilities.map((a) => a.slot)).toEqual([
            "Passive",
            "Q",
            "W",
            "E",
            "R",
        ]);
        expect(kit.abilities[0].name).toBe(veigar.data.Veigar.passive.name);
        expect(kit.abilities[1].name).toBe(veigar.data.Veigar.spells[0].name);
    });

    test("strips HTML tags and collapses whitespace in descriptions", () => {
        const kit = mapChampionKit({
            data: {
                X: {
                    id: "X",
                    name: "X",
                    passive: {
                        name: "P",
                        description:
                            'Hits <b>hard</b><br>and&nbsp;fast <span class="a">now</span>',
                    },
                    spells: [],
                },
            },
        })!;
        expect(kit.abilities[0].description).toBe("Hits hard and fast now");
    });

    test("truncates long descriptions", () => {
        const kit = mapChampionKit({
            data: {
                X: {
                    id: "X",
                    name: "X",
                    passive: { name: "P", description: "a".repeat(1000) },
                },
            },
        })!;
        const text = kit.abilities[0].description!;
        expect(text.length).toBeLessThanOrEqual(241);
        expect(text.endsWith("…")).toBe(true);
    });

    test("keeps cooldowns per rank, cost and range", () => {
        const kit = mapChampionKit(ahri)!;
        const w = kit.abilities.find((a) => a.slot === "W")!;
        expect(w.cooldowns).toEqual([9, 8, 7, 6, 5]);
        expect(w.cost).toBe("30");
        expect(w.range).toBe("700");
        const q = kit.abilities.find((a) => a.slot === "Q")!;
        expect(q.cost).toBe("55/65/75/85/95");
    });

    test("tolerates missing fields", () => {
        const kit = mapChampionKit({
            data: { Y: { id: "Y", spells: [{ name: "Only name" }, 5, null] } },
        })!;
        expect(kit.name).toBe("Y");
        expect(kit.abilities).toEqual([{ slot: "Q", name: "Only name" }]);
    });

    test("returns undefined for unusable input", () => {
        expect(mapChampionKit(undefined)).toBeUndefined();
        expect(mapChampionKit({})).toBeUndefined();
        expect(mapChampionKit({ data: {} })).toBeUndefined();
        expect(mapChampionKit("x")).toBeUndefined();
    });

    test("formatChampionKit lists each ability with its numbers", () => {
        const text = formatChampionKit(mapChampionKit(ahri)!);
        expect(text).toContain("Ahri");
        expect(text).toContain("W: Fuego zorruno");
        expect(text).toContain("cooldown 9/8/7/6/5s");
        expect(text).toContain("range 700");
    });
});

describe("champion kit loader", () => {
    const response = (body: unknown, ok = true) =>
        ({ ok, json: async () => body }) as Response;

    test("builds the Data Dragon url", () => {
        expect(championKitUrl("16.23.1", "es_ES", "Veigar")).toBe(
            "https://ddragon.leagueoflegends.com/cdn/16.23.1/data/es_ES/champion/Veigar.json",
        );
    });

    test("second call does not fetch again", async () => {
        const urls: string[] = [];
        const load = createChampionKitLoader(async (url) => {
            urls.push(url);
            return response(veigar);
        });
        const a = await load("16.23.1", "es_ES", "Veigar");
        const b = await load("16.23.1", "es_ES", "Veigar");
        expect(a?.id).toBe("Veigar");
        expect(b).toBe(a);
        expect(urls).toHaveLength(1);
        await load("16.23.1", "en_US", "Veigar");
        await load("16.24.1", "es_ES", "Veigar");
        expect(urls).toHaveLength(3);
    });

    test("concurrent calls share one request", async () => {
        let calls = 0;
        const load = createChampionKitLoader(async () => {
            calls++;
            return response(ahri);
        });
        await Promise.all([
            load("v", "es_ES", "Ahri"),
            load("v", "es_ES", "Ahri"),
        ]);
        expect(calls).toBe(1);
    });

    test("failures return undefined and are not cached", async () => {
        let calls = 0;
        const load = createChampionKitLoader(async () => {
            calls++;
            if (calls === 1) return response({}, false);
            if (calls === 2) throw new Error("offline");
            return response(ahri);
        });
        expect(await load("v", "es_ES", "Ahri")).toBeUndefined();
        expect(await load("v", "es_ES", "Ahri")).toBeUndefined();
        expect((await load("v", "es_ES", "Ahri"))?.id).toBe("Ahri");
        expect(calls).toBe(3);
    });
});
