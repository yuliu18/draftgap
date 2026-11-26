import { describe, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/query-core";
import fixture from "./__fixtures__/lolalytics-ahri.json";
import {
    BuildDataNeedsDesktopError,
    LolalyticsPageData,
    extractLolalyticsPageData,
    lolalyticsPageUrl,
    pageDataToBuildSource,
} from "./lolalytics-page";
import {
    fetchBuildData,
    fullDatasetFromLolalyticsData,
    partialDatasetFromLolalyticsData,
} from "./data";
import { Role } from "../models/Role";
import { Dataset } from "../models/dataset/Dataset";

// Fixture: real https://lolalytics.com/lol/ahri/build/ (and /vs/zed/) pages,
// patch=30, tier=emerald_plus, parsed and trimmed (see `source` in the file).
const build = fixture.build as unknown as LolalyticsPageData;
const matchup = fixture.matchup as unknown as LolalyticsPageData;

// Stat shards as in apps/dataset/src/index.ts.
const SHARDS: Record<number, { slots: number[] }> = {
    5001: { slots: [1, 2] },
    5005: { slots: [0] },
    5007: { slots: [0] },
    5008: { slots: [0, 1] },
    5010: { slots: [1] },
    5011: { slots: [2] },
    5013: { slots: [2] },
};
const runeIds = new Set(
    Object.keys(build.runes.stats)
        .map((k) => parseInt(k))
        .filter((id) => id >= 8000),
);
runeIds.delete(8229); // not in the dataset: must be skipped, not fail
const dataset = {
    version: "16.23.1",
    date: "",
    championData: {
        "103": { id: "Ahri" },
        "238": { id: "Zed" },
        "62": { id: "MonkeyKing" },
    },
    itemData: {},
    runePathData: {},
    summonerSpellData: {},
    runeData: Object.fromEntries([...runeIds].map((id) => [id, { id }])),
    statShardData: Object.fromEntries(
        Object.entries(SHARDS).map(([id, v]) => [
            id,
            { id, positions: v.slots.map((slot) => ({ slot, index: 0 })) },
        ]),
    ),
} as unknown as Dataset;

const wins = (games: number, wr: number) => Math.round(games * (wr / 100));
const partial = (page: LolalyticsPageData) =>
    partialDatasetFromLolalyticsData(
        dataset,
        "103",
        Role.Middle,
        pageDataToBuildSource(page),
    );

// Minimal qwik/json document: every value of an object is a base36 index.
function qwikHtml(root: Record<string, unknown>, withEnemy: boolean) {
    const objs: unknown[] = [];
    const push = (v: unknown): string => {
        const idx = objs.length;
        objs.push(null);
        if (Array.isArray(v)) objs[idx] = v.map(push);
        else if (v !== null && typeof v === "object")
            objs[idx] = Object.fromEntries(
                Object.entries(v).map(([k, x]) => [k, push(x)]),
            );
        else objs[idx] = v;
        return idx.toString(36);
    };
    push({ decoy: 1 });
    push({
        ...root,
        analysed: 5,
        avgWr: 51,
        ...(withEnemy ? { enemy: {} } : {}),
    });
    return `<html><script type="qwik/json">${JSON.stringify({ objs })}</script></html>`;
}

describe("lolalyticsPageUrl", () => {
    test("champion page: tier, patch and lane, no region", () => {
        expect(lolalyticsPageUrl("16.23.1", "Ahri", "middle")).toBe(
            "https://lolalytics.com/lol/ahri/build/?tier=emerald_plus&patch=16.23&lane=middle",
        );
    });
    test("30 days patch value is kept", () => {
        expect(lolalyticsPageUrl("30", "Ahri", "middle")).toContain("patch=30");
    });
    test("matchup page uses /vs/<champion>/ and vslane, no region", () => {
        const url = lolalyticsPageUrl("30", "Ahri", "middle", "Zed", "top");
        expect(url).toBe(
            "https://lolalytics.com/lol/ahri/vs/zed/build/?tier=emerald_plus&patch=30&lane=middle&vslane=top",
        );
        expect(url).not.toContain("region");
    });
    test("MonkeyKing maps to wukong", () => {
        expect(lolalyticsPageUrl("30", "MonkeyKing", "top")).toContain(
            "/lol/wukong/",
        );
    });
});

describe("extractLolalyticsPageData", () => {
    const root = {
        header: build.header,
        runes: build.runes,
        startSet: build.startSet,
    };
    test("reads the build object of a champion page", () => {
        const data = extractLolalyticsPageData(qwikHtml(root, true));
        expect(data.header).toEqual(build.header);
        expect(data.runes.stats["8112"]).toEqual(build.runes.stats["8112"]);
    });
    test("reads a matchup page, which has no enemy key", () => {
        const data = extractLolalyticsPageData(qwikHtml(root, false));
        expect(data.header.n).toBe(build.header.n);
    });
    test("throws on a page without qwik data", () => {
        expect(() => extractLolalyticsPageData("<html></html>")).toThrow(
            "Lolalytics page has no qwik/json data",
        );
    });
    test("throws on a page with an unexpected shape", () => {
        const html = qwikHtml(
            { header: {}, runes: build.runes, startSet: [] },
            true,
        );
        expect(() => extractLolalyticsPageData(html)).toThrow(
            "unexpected shape",
        );
    });
});

describe("page data -> PartialBuildDataset", () => {
    test("games and wins come from the header", () => {
        const p = partial(build);
        expect(p.games).toBe(655343);
        expect(p.wins).toBe(wins(655343, 53.09));
        expect(p.championKey).toBe("103");
    });

    test("runes: primary and secondary from the row index", () => {
        const { runes } = partial(build);
        const [, wr, games] = build.runes.stats["8112"][0];
        expect(runes.primary[8112]).toEqual({ wins: wins(games, wr), games });
        const [, swr, sgames] = build.runes.stats["8226"][1];
        expect(runes.secondary[8226]).toEqual({
            wins: wins(sgames, swr),
            games: sgames,
        });
        // 8106 is picked as primary (row 0) and secondary (row 1)
        expect(runes.primary[8106].games).toBe(build.runes.stats["8106"][0][2]);
        expect(runes.secondary[8106].games).toBe(
            build.runes.stats["8106"][1][2],
        );
    });

    test("stat shards: offense, defense and the f-suffixed flex slot", () => {
        const { shards } = partial(build).runes;
        expect(shards.offense[5005].games).toBe(611825);
        expect(shards.offense[5008].games).toBe(36670);
        expect(shards.defense[5001].games).toBe(505386);
        expect(shards.defense[5013].games).toBe(9710);
        expect(shards.flex[5008].games).toBe(build.runes.stats["5008f"][0][2]);
        expect(shards.flex[5010].games).toBe(build.runes.stats["5010f"][0][2]);
    });

    test("items: order 1-5, boots without no-boots/base boots, sorted starting sets", () => {
        const { items } = partial(build);
        expect(items.statsByOrder).toHaveLength(5);
        expect(items.statsByOrder[0][3118]).toEqual({
            wins: wins(404596, 53.12),
            games: 404596,
        });
        expect(Object.keys(items.statsByOrder[4]).length).toBeGreaterThan(0);
        expect(items.boots[3020].games).toBe(374682);
        expect(items.boots[1001]).toBeUndefined();
        expect(items.boots[9999]).toBeUndefined();
        expect(items.startingSets["1056_2003_2003"]).toEqual({
            wins: wins(650052, 53.1),
            games: 650052,
        });
    });

    test("summoner spells: order-insensitive key", () => {
        const { summonerSpells } = partial(build);
        expect(summonerSpells["14_4"]).toEqual({
            wins: wins(457974, 53.54),
            games: 457974,
        });
    });

    test("skills: order [games, wins] and per-level Q W E R", () => {
        const { skills } = partial(build);
        expect(skills.order.QWE).toEqual({
            wins: wins(595814, 53.4),
            games: 595814,
        });
        expect(skills.level).toHaveLength(build.skillEarly!.length);
        expect(skills.level[0].W).toEqual({
            wins: wins(536262, 53.1),
            games: 536262,
        });
        expect(skills.level[5].R.games).toBe(654071);
    });
});

describe("page data -> FullBuildDataset", () => {
    test("a matchup page becomes a matchup entry with its own stats", () => {
        const full = fullDatasetFromLolalyticsData(
            dataset,
            "103",
            Role.Middle,
            pageDataToBuildSource(build),
            [
                {
                    championKey: "238",
                    role: Role.Middle,
                    championData: pageDataToBuildSource(matchup),
                },
            ],
        );
        expect(full.matchups).toHaveLength(1);
        expect(full.matchups[0].games).toBe(27319);
        expect(full.matchups[0].wins).toBe(wins(27319, 51.65));
        expect(full.matchups[0].runes.primary[8112].games).toBe(
            matchup.runes.stats["8112"][0][2],
        );
        expect(full.matchups[0].skills.order.QWE.games).toBe(24637);
    });
});

describe("documented gaps", () => {
    test("G1: item sets are never filled (the page has none either)", () => {
        expect(partial(build).items.sets).toEqual({});
    });
    test("G2: a rune the dataset does not know is skipped, not an error", () => {
        const p = partial(build);
        expect(p.runes.primary[8229]).toBeUndefined();
        expect(p.runes.secondary[8229]).toBeUndefined();
        expect(p.runes.primary[8112]).toBeDefined();
    });
    test("G3: a missing item slot gives an empty slot, not an error", () => {
        const p = partial({ ...build, item5: undefined, item4: undefined });
        expect(p.items.statsByOrder[3]).toEqual({});
        expect(p.items.statsByOrder[4]).toEqual({});
        expect(Object.keys(p.items.statsByOrder[0]).length).toBeGreaterThan(0);
    });
    test("G4: unknown skill orders and malformed rows are dropped", () => {
        const p = partial({
            ...build,
            skillOrder: [["QQQ", 50, 1, 100], ...build.skillOrder!],
            spells: [["4_14", 50, 1] as never, ...build.spells!],
            boots: [[3020], ...build.boots!],
        });
        expect(Object.keys(p.skills.order)).not.toContain("QQQ");
        expect(Object.keys(p.summonerSpells)).toEqual(
            Object.keys(partial(build).summonerSpells),
        );
        expect(Object.keys(p.items.boots).length).toBe(
            Object.keys(partial(build).items.boots).length,
        );
    });
    test("G5: no skill or spell data gives empty maps", () => {
        const p = partial({
            ...build,
            skillOrder: undefined,
            skillEarly: undefined,
            spells: undefined,
        });
        expect(Object.keys(p.skills.order)).toEqual([]);
        expect(p.skills.level).toEqual([]);
        expect(p.summonerSpells).toEqual({});
    });
});

describe("fetchBuildData with a page fetcher", () => {
    const html = (page: LolalyticsPageData) =>
        qwikHtml(
            {
                header: page.header,
                runes: page.runes,
                startSet: page.startSet,
                spells: page.spells,
                boots: page.boots,
                item1: page.item1,
                item2: page.item2,
                item3: page.item3,
                item4: page.item4,
                item5: page.item5,
                skillOrder: page.skillOrder,
                skillEarly: page.skillEarly,
            },
            false,
        );
    const opponents = new Map([[Role.Middle, "238"]]);

    test("fetches the champion page, the 30 days page and one page per matchup", async () => {
        const urls: string[] = [];
        const [partialDs, fullDs] = await fetchBuildData(
            new QueryClient(),
            dataset,
            "103",
            Role.Middle,
            opponents,
            async (url) => {
                urls.push(url);
                return html(url.includes("/vs/") ? matchup : build);
            },
        );
        expect(urls.sort()).toEqual(
            [
                "https://lolalytics.com/lol/ahri/build/?tier=emerald_plus&patch=16.23&lane=middle",
                "https://lolalytics.com/lol/ahri/build/?tier=emerald_plus&patch=30&lane=middle",
                "https://lolalytics.com/lol/ahri/vs/zed/build/?tier=emerald_plus&patch=30&lane=middle&vslane=middle",
            ].sort(),
        );
        expect(partialDs.games).toBe(655343);
        expect(fullDs.matchups.map((m) => m.championKey)).toEqual(["238"]);
    });

    test("a matchup page that fails drops only that matchup", async () => {
        const [, fullDs] = await fetchBuildData(
            new QueryClient(),
            dataset,
            "103",
            Role.Middle,
            opponents,
            async (url) => {
                if (url.includes("/vs/")) throw new Error("404");
                return html(build);
            },
        );
        expect(fullDs.matchups).toEqual([]);
        expect(fullDs.games).toBe(655343);
    });

    test("a failing champion page fails the build; desktop error propagates", async () => {
        await expect(
            fetchBuildData(
                new QueryClient(),
                dataset,
                "103",
                Role.Middle,
                opponents,
                async () => {
                    throw new BuildDataNeedsDesktopError();
                },
            ),
        ).rejects.toBeInstanceOf(BuildDataNeedsDesktopError);
    });
});
