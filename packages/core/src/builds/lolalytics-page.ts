// Build statistics read from the public Lolalytics build page.
//
// Lolalytics' `ax.lolalytics.com/mega/?ep=champion` endpoint, which
// `apps/dataset/src/lolalytics/champion.ts` calls, returns 404. The build page
// at `https://lolalytics.com/lol/<champion>/build/` still embeds the same
// numbers in a `qwik/json` script. This file reads that page and converts it
// to the response shape `data.ts` already consumes, so the analysis is
// unchanged. The old endpoint code stays in `apps/dataset`, untouched.
//
// Row layouts on the page (percentages, not fractions):
//   items, boots, spells, startSet: [id, winrate, pickrate, games, ...]
//   runes.stats[id][i]:            [pickrate, winrate, games]  (0 primary, 1 secondary)
//   skillOrder:                    [order, winrate, pickrate, games]
//   skillEarly[level][skill]:      [winrate, pickrate, games]
// The legacy response used [games, wins] for skills; the adapter converts.

import { LolalyticsRole } from "../../../../apps/dataset/src/lolalytics/roles";

export type PageFetcher = (url: string) => Promise<string>;

/** Thrown by the web build, which cannot read lolalytics.com (no CORS). */
export class BuildDataNeedsDesktopError extends Error {
    constructor() {
        super("Build data needs the desktop app");
        this.name = "BuildDataNeedsDesktopError";
    }
}

export type LolalyticsPageData = {
    header: { n: number; wr: number };
    runes: { stats: Record<string, number[][]> };
    spells?: [string, number, number, number][];
    startSet?: [string, number, number, number][];
    boots?: number[][];
    item1?: number[][];
    item2?: number[][];
    item3?: number[][];
    item4?: number[][];
    item5?: number[][];
    skillOrder?: [string, number, number, number][];
    skillEarly?: number[][][];
};

/** The subset of the legacy `LolalyticsChampionResponse` that `data.ts` reads. */
export type BuildSourceData = {
    header: { n: number; wr: number };
    runes: { stats: Record<string, [number, number, number][]> };
    spells: [string, number, number, number][];
    startSet: [string, number, number, number][];
    boots: number[][];
    item1: number[][];
    item2: number[][];
    item3: number[][];
    item4: number[][];
    item5: number[][];
    skills: {
        skillEarly: [number, number][][];
        skillOrder: [string, number, number][];
    };
};

const SKILL_ORDERS = ["QWE", "QEW", "WQE", "WEQ", "EQW", "EWQ"];

function slug(championId: string) {
    const id = championId.toLowerCase();
    return id === "monkeyking" ? "wukong" : id;
}

/**
 * `region=all` makes matchup pages 404 (checked 2026-11-26), so it is left
 * out; the default region is already all regions.
 */
export function lolalyticsPageUrl(
    patch: string,
    championId: string,
    role: LolalyticsRole,
    matchupId?: string,
    matchupRole?: LolalyticsRole,
) {
    // 12.21.1 -> 12.21; "30" (30 days) stays as is.
    const page = patch.split(".").slice(0, 2).join(".");
    const params = new URLSearchParams();
    params.append("tier", "emerald_plus");
    params.append("patch", page);
    params.append("lane", role);
    let vs = "";
    if (matchupId && matchupRole) {
        vs = `vs/${slug(matchupId)}/`;
        params.append("vslane", matchupRole);
    }
    return `https://lolalytics.com/lol/${slug(championId)}/${vs}build/?${params.toString()}`;
}

const WANTED_KEYS = [
    "header",
    "runes",
    "spells",
    "startSet",
    "boots",
    "item1",
    "item2",
    "item3",
    "item4",
    "item5",
    "skillOrder",
    "skillEarly",
] as const;

// Matchup pages have no `enemy` key, so the upstream finder in `qwik.ts`
// (which needs it) cannot parse them; this one does not.
export function extractLolalyticsPageData(html: string): LolalyticsPageData {
    const match = html.match(
        /<script\s+type=["']qwik\/json["'][^>]*>([\s\S]*?)<\/script>/i,
    );
    if (!match) {
        throw new Error("Lolalytics page has no qwik/json data");
    }
    const parsed: unknown = JSON.parse(match[1]);
    const objs = (parsed as { objs?: unknown } | null)?.objs;
    if (!Array.isArray(objs)) {
        throw new Error("Lolalytics page has no build data object");
    }

    const root = objs.find(
        (o): o is Record<string, string> =>
            o != null &&
            typeof o === "object" &&
            !Array.isArray(o) &&
            "analysed" in o &&
            "avgWr" in o &&
            "runes" in o &&
            "startSet" in o,
    );
    if (!root) {
        throw new Error("Lolalytics page has no build data object");
    }

    // Indexes being resolved right now: a reference back to one of them is a
    // cycle and resolves to null instead of recursing forever.
    const resolving = new Set<number>();
    const resolve = (ref: string): unknown => {
        const index = parseInt(ref, 36);
        if (resolving.has(index)) return null;
        const obj = objs[index];
        if (obj === null || obj === undefined) return null;
        if (typeof obj !== "object") return obj;
        resolving.add(index);
        try {
            if (Array.isArray(obj)) return obj.map((v) => resolve(v));
            return Object.fromEntries(
                Object.entries(obj).map(([k, v]) => [k, resolve(v as string)]),
            );
        } finally {
            resolving.delete(index);
        }
    };

    const data: Record<string, unknown> = {};
    for (const key of WANTED_KEYS) {
        if (key in root) data[key] = resolve(root[key]);
    }

    const header = data.header as { n?: unknown; wr?: unknown } | undefined;
    const runes = data.runes as { stats?: unknown } | undefined;
    if (
        typeof header?.n !== "number" ||
        typeof header?.wr !== "number" ||
        typeof runes?.stats !== "object" ||
        runes.stats === null
    ) {
        throw new Error("Lolalytics page has an unexpected shape");
    }

    return data as LolalyticsPageData;
}

function winsOf(games: number, winrate: number) {
    return Math.round(games * (winrate / 100));
}

/** Rows too short to hold id, winrate, pickrate and games are dropped. */
function itemRows(rows: number[][] | undefined) {
    return (rows ?? []).filter(
        (r) =>
            Array.isArray(r) &&
            r.length >= 4 &&
            r.slice(0, 4).every(Number.isFinite),
    );
}

export function pageDataToBuildSource(
    page: LolalyticsPageData,
): BuildSourceData {
    const setRows = (rows: LolalyticsPageData["spells"]) =>
        (rows ?? []).filter(
            (r) =>
                Array.isArray(r) &&
                typeof r[0] === "string" &&
                Number.isFinite(r[1]) &&
                Number.isFinite(r[3]),
        );

    return {
        header: { n: page.header.n, wr: page.header.wr },
        runes: {
            stats: Object.fromEntries(
                Object.entries(page.runes.stats).map(([id, rows]) => [
                    id,
                    (Array.isArray(rows) ? rows : []).filter(
                        (r) =>
                            Array.isArray(r) &&
                            r.length >= 3 &&
                            r.slice(0, 3).every(Number.isFinite),
                    ) as [number, number, number][],
                ]),
            ),
        },
        spells: setRows(page.spells),
        startSet: setRows(page.startSet),
        boots: itemRows(page.boots),
        item1: itemRows(page.item1),
        item2: itemRows(page.item2),
        item3: itemRows(page.item3),
        item4: itemRows(page.item4),
        item5: itemRows(page.item5),
        skills: {
            // [order, winrate, pickrate, games] -> [order, games, wins]
            skillOrder: (page.skillOrder ?? [])
                .filter(
                    (r) =>
                        Array.isArray(r) &&
                        SKILL_ORDERS.includes(r[0]) &&
                        Number.isFinite(r[1]) &&
                        Number.isFinite(r[3]),
                )
                .map(
                    ([order, wr, , games]) =>
                        [order, games, winsOf(games, wr)] as [
                            string,
                            number,
                            number,
                        ],
                ),
            // [winrate, pickrate, games] -> [games, wins]. The position in a
            // level is the skill (Q, W, E, R), so an invalid row keeps its
            // place as "no games" and an invalid level becomes empty.
            skillEarly: (page.skillEarly ?? []).map((level) =>
                (Array.isArray(level) ? level : []).map((row) =>
                    Array.isArray(row) &&
                    Number.isFinite(row[0]) &&
                    Number.isFinite(row[2])
                        ? ([row[2], winsOf(row[2], row[0])] as [number, number])
                        : ([0, 0] as [number, number]),
                ),
            ),
        },
    };
}

export async function getLolalyticsPageBuildSource(
    fetchPage: PageFetcher,
    patch: string,
    championId: string,
    role: LolalyticsRole,
    matchupId?: string,
    matchupRole?: LolalyticsRole,
) {
    const url = lolalyticsPageUrl(
        patch,
        championId,
        role,
        matchupId,
        matchupRole,
    );
    const html = await fetchPage(url);
    return pageDataToBuildSource(extractLolalyticsPageData(html));
}
