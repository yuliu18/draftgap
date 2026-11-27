import { expect, test } from "bun:test";
import { Role } from "../models/Role";
import { mapLcuMatchHistory, mergePersonalMatches } from "./lcu-match-history";
import { PersonalMatch } from "./personal-stats";
import {
    importRiotHistory,
    mapRiotMatch,
    riotRegionForPlatform,
} from "./riot-match-history";

const champion = (id: number) => (id === 103 ? "103" : undefined);
const ok = <T>(data: T) => ({ kind: "ok" as const, data });
const throttled = (seconds: number) => ({
    kind: "rateLimited" as const,
    retryAfter: seconds,
});
const id = (n: number) => `EUW1_${n}`;
function match(n = 1, positions = {}, info = {}) {
    return {
        metadata: { matchId: id(n) },
        info: {
            gameCreation: n * 1000,
            gameDuration: 301,
            gameEndTimestamp: 555,
            queueId: 420,
            participants: [
                { puuid: "other" },
                {
                    puuid: "player",
                    championId: 103,
                    teamPosition: "UTILITY",
                    win: true,
                    kills: 1,
                    deaths: 2,
                    assists: 3,
                    totalMinionsKilled: 10,
                    neutralMinionsKilled: 2,
                    goldEarned: 500,
                    totalDamageDealtToChampions: 90,
                    visionScore: 8,
                    ...positions,
                },
            ],
            ...info,
        },
    };
}

const mapped = (raw: unknown, knownMatches?: PersonalMatch[]) =>
    mapRiotMatch(raw, "player", champion, { knownMatches });

test("platform IDs, client aliases, and routing regions are case insensitive", () => {
    for (const [region, platforms] of [
        ["americas", "americas NA NA1 BR BR1 LAN LA1 LAS LA2"],
        ["europe", "europe EUW EUW1 EUNE EUN1 TR TR1 RU"],
        ["asia", "asia KR JP JP1"],
        ["sea", "sea OCE OC1 PH2 SG2 TH2 TW2 VN2"],
    ] as const) {
        for (const platform of platforms.split(" ")) {
            expect(riotRegionForPlatform(platform.toLowerCase())).toBe(region);
        }
    }
    expect(riotRegionForPlatform("https://example.org")).toBeUndefined();
});

test("maps the selected PUUID, assigned role, numeric game ID and performance units", () => {
    expect(mapped(match(1, { individualPosition: "TOP" }))).toEqual({
        championKey: "103",
        role: Role.Support,
        roleInferred: false,
        gameId: 1,
        timestamp: 1000,
        win: true,
        perf: {
            kills: 1,
            deaths: 2,
            assists: 3,
            cs: 12,
            gold: 500,
            damage: 90,
            vision: 8,
            duration: 301,
            queueId: 420,
        },
    });
    expect(
        mapped(
            match(
                1,
                {},
                { gameEndTimestamp: undefined, gameDuration: 301_000 },
            ),
        )?.perf?.duration,
    ).toBe(301);
    expect(mapRiotMatch(match(), "absent", champion)).toBeUndefined();
    const old = { ...mapped(match())!, role: Role.Top };
    expect(mergePersonalMatches([old], [mapped(match())!])).toEqual([
        mapped(match()),
    ]);
});

test("known fallback position, then Smite, then stored evidence; unknown without evidence", () => {
    const raw = match(2, { teamPosition: "", individualPosition: "MID" });
    expect(
        mapped(
            match(2, { teamPosition: "invalid", individualPosition: "MIDDLE" }),
        )?.role,
    ).toBe(Role.Middle);
    expect(mapped(raw)).toBeUndefined();
    expect(mapped(match(2, { teamPosition: "", summoner1Id: 11 }))?.role).toBe(
        Role.Jungle,
    );
    expect(mapped(raw, [mapped(match())!])).toMatchObject({
        role: Role.Support,
        roleInferred: true,
    });
});

test("filters queues and remakes after normalizing either duration format", () => {
    expect(mapped(match(1, {}, { queueId: 450 }))).toBeUndefined();
    expect(mapped(match(1, {}, { gameDuration: 299 }))).toBeUndefined();
    expect(
        mapped(
            match(
                1,
                {},
                { gameEndTimestamp: undefined, gameDuration: 299_999 },
            ),
        ),
    ).toBeUndefined();
    expect(mapped(match(1, {}, { gameDuration: 300 }))?.perf?.duration).toBe(
        300,
    );
});

const riotId = { gameName: "Name", tagLine: "TAG" };
function harness(size: number, existing: PersonalMatch[] = []) {
    let now = 0;
    let stored = existing;
    const times: number[] = [];
    const pages: [number, number][] = [];
    const progress: number[] = [];
    const deps = {
        getAccount: async (_name: string, _tag: string) => {
            times.push(now);
            return ok({ puuid: "player" });
        },
        getMatchIds: async (puuid: string, start: number, count: number) => {
            expect(puuid).toBe("player");
            pages.push([start, count]);
            times.push(now);
            return ok(
                Array.from(
                    { length: Math.min(count, Math.max(0, size - start)) },
                    (_, i) => id(start + i + 1),
                ),
            );
        },
        getMatch: async (matchId: string) => {
            times.push(now);
            return ok(match(Number(matchId.split("_")[1])));
        },
        now: () => now,
        sleep: async (ms: number) => {
            now += ms;
        },
        championKeyById: champion,
        getMatches: () => stored,
        mergeMatches: (incoming: PersonalMatch[]) => {
            stored = mergePersonalMatches(stored, incoming);
        },
    };
    const options = {
        ...riotId,
        onProgress: ({ read }: { read: number }) => progress.push(read),
    };
    return { deps, options, times, pages, progress };
}

test("pages in hundreds until empty and reports progress and totals", async () => {
    const { deps, options, pages, progress } = harness(102);
    expect(
        await importRiotHistory(deps, { ...options, maxGames: 350 }),
    ).toEqual({ read: 102, imported: 102, total: 102, skippedUnknownRole: 0 });
    expect(pages).toEqual([
        [0, 100],
        [100, 100],
        [102, 100],
    ]);
    expect(progress[0]).toBe(0);
    expect(progress.at(-1)).toBe(102);
});

test("default and hard limits bound details and page requests", async () => {
    const a = harness(700);
    expect(await importRiotHistory(a.deps, a.options)).toMatchObject({
        read: 100,
    });
    expect(a.pages).toEqual([[0, 100]]);
    const b = harness(700);
    expect(
        await importRiotHistory(b.deps, { ...b.options, maxGames: 900 }),
    ).toMatchObject({ read: 500 });
    expect(b.pages).toHaveLength(5);
});

test("keeps paging past a fully stored page until the requested games are read", async () => {
    const existing = Array.from({ length: 100 }, (_, i) => ({
        ...mapped(match(i + 1))!,
        role: Role.Top,
    }));
    const { deps, options, pages } = harness(150, existing);
    expect(
        await importRiotHistory(deps, { ...options, maxGames: 150 }),
    ).toEqual({ read: 150, imported: 50, total: 150, skippedUnknownRole: 0 });
    expect(pages).toEqual([
        [0, 100],
        [100, 50],
    ]);
    expect(deps.getMatches().every((m) => m.role === Role.Support)).toBe(true);
});

test("paces all requests in both rolling windows", async () => {
    const { deps, options, times } = harness(100);
    await importRiotHistory(deps, options);
    expect(times).toHaveLength(102);
    expect(times[15] - times[0]).toBe(1000);
    expect(times[90] - times[0]).toBe(120_000);
    for (let i = 0; i < times.length; i++) {
        if (i >= 15)
            expect(times[i] - times[i - 15]).toBeGreaterThanOrEqual(1000);
        if (i >= 90)
            expect(times[i] - times[i - 90]).toBeGreaterThanOrEqual(120_000);
    }
});

test("waits Retry-After, succeeds on the third retry, and caps exhausted retries", async () => {
    for (const always of [false, true]) {
        const { deps, options, times } = harness(0);
        let attempts = 0;
        const pending = importRiotHistory(
            {
                ...deps,
                getAccount: async () => {
                    times.push(deps.now());
                    return ++attempts < 4 || always
                        ? throttled(2)
                        : ok({ puuid: "player" });
                },
            },
            options,
        );
        if (always)
            await expect(pending).rejects.toThrow(
                "Riot API rate limit exceeded",
            );
        else
            expect(await pending).toEqual({
                read: 0,
                imported: 0,
                total: 0,
                skippedUnknownRole: 0,
            });
        expect(attempts).toBe(4);
        expect(times.slice(0, 4)).toEqual([0, 2000, 4000, 6000]);
    }
});

test("cancel while waiting for Retry-After stops without another request", async () => {
    const { deps, options } = harness(2);
    const controller = new AbortController();
    let attempts = 0;
    expect(
        await importRiotHistory(
            {
                ...deps,
                getAccount: async () => {
                    attempts++;
                    return throttled(60);
                },
                sleep: async () => controller.abort(),
            },
            { ...options, signal: controller.signal },
        ),
    ).toEqual({ read: 0, imported: 0, total: 0, skippedUnknownRole: 0 });
    expect(attempts).toBe(1);
    expect(deps.getMatches()).toEqual([]);
});

test("invalid key surfaces unchanged and does not touch history", async () => {
    const { deps, options, pages } = harness(2);
    const error = new Error("Riot API key invalid or expired");
    await expect(
        importRiotHistory(
            {
                ...deps,
                getAccount: async () => {
                    throw error;
                },
            },
            options,
        ),
    ).rejects.toBe(error);
    expect(pages).toEqual([]);
    expect(deps.getMatches()).toEqual([]);
});

test("a detail failure keeps successful prior details; skips are counted on success", async () => {
    const { deps, options } = harness(3);
    const error = new Error("offline");
    await expect(
        importRiotHistory(
            {
                ...deps,
                getMatch: async (matchId) => {
                    if (matchId !== id(1)) throw error;
                    return ok(match());
                },
            },
            options,
        ),
    ).rejects.toBe(error);
    expect(deps.getMatches()).toEqual([mapped(match())]);
    const other = harness(1);
    expect(
        await importRiotHistory(
            {
                ...other.deps,
                getMatch: async () => ok(match(1, { teamPosition: "" })),
            },
            other.options,
        ),
    ).toEqual({ read: 1, imported: 0, total: 0, skippedUnknownRole: 1 });
});

test("client sync still recognizes its MID alias and duration heuristic", () => {
    expect(
        mapLcuMatchHistory(
            {
                games: {
                    games: [
                        {
                            gameId: 1,
                            gameCreation: 1000,
                            gameDuration: 301000,
                            queueId: 420,
                            participants: [
                                {
                                    championId: 103,
                                    teamPosition: "MID",
                                    stats: { win: true },
                                },
                            ],
                        },
                    ],
                },
            },
            champion,
        ),
    ).toEqual([
        {
            gameId: 1,
            timestamp: 1000,
            championKey: "103",
            role: Role.Middle,
            win: true,
            perf: { duration: 301, queueId: 420 },
        },
    ]);
});
