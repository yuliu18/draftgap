import { describe, expect, test } from "bun:test";
import {
    TREND_THRESHOLD,
    analyzePersonalMatches,
    trendDirection,
} from "./analyzer";
import { PersonalMatch, PersonalPerf } from "./personal-stats";
import { Role } from "../models/Role";

const MIN = 60;
function m(
    i: number,
    win: boolean,
    perf?: PersonalPerf,
    over: Partial<PersonalMatch> = {},
): PersonalMatch {
    return {
        championKey: "103",
        role: Role.Middle,
        win,
        timestamp: 1000 + i,
        ...(perf ? { perf } : {}),
        ...over,
    };
}
const p = (over: PersonalPerf = {}): PersonalPerf => ({
    kills: 5,
    deaths: 5,
    assists: 5,
    cs: 300,
    gold: 15000,
    damage: 30000,
    vision: 30,
    duration: 30 * MIN,
    ...over,
});

describe("overall and per pick metrics", () => {
    test("computes the metrics with sample sizes", () => {
        const r = analyzePersonalMatches([
            m(1, true, p({ kills: 10, deaths: 2, assists: 4 })),
            m(2, false, p({ kills: 2, deaths: 4, assists: 2 })),
        ]);
        const o = r.overall;
        expect(o.games).toBe(2);
        expect(o.wins).toBe(1);
        expect(o.winrate).toBe(0.5);
        // sums: (12 + 6) / 6
        expect(o.kda).toEqual({ value: 3, sample: 2 });
        expect(o.kills).toEqual({ value: 6, sample: 2 });
        expect(o.deaths).toEqual({ value: 3, sample: 2 });
        expect(o.assists).toEqual({ value: 3, sample: 2 });
        expect(o.csPerMin).toEqual({ value: 10, sample: 2 });
        expect(o.goldPerMin).toEqual({ value: 500, sample: 2 });
        expect(o.damagePerMin).toEqual({ value: 1000, sample: 2 });
        expect(o.visionPerMin).toEqual({ value: 1, sample: 2 });
        expect(o.duration).toEqual({ value: 1800, sample: 2 });
    });

    test("deaths = 0 uses max(1, deaths)", () => {
        const r = analyzePersonalMatches([
            m(1, true, p({ kills: 4, deaths: 0, assists: 6 })),
        ]);
        expect(r.overall.kda?.value).toBe(10);
    });

    test("only matches with the needed fields count, per metric", () => {
        const r = analyzePersonalMatches([
            m(1, true, p()),
            m(2, true, { kills: 1, deaths: 1, assists: 1 }),
            m(3, false),
        ]);
        expect(r.overall.games).toBe(3);
        expect(r.overall.kda?.sample).toBe(2);
        expect(r.overall.csPerMin?.sample).toBe(1);
        expect(r.overall.duration?.sample).toBe(1);
        expect(r.matchesWithPerf).toBe(2);
    });

    test("metrics are undefined with no perf and winrate is still given", () => {
        const r = analyzePersonalMatches([m(1, true)]);
        expect(r.overall.kda).toBeUndefined();
        expect(r.overall.csPerMin).toBeUndefined();
        expect(r.overall.winrate).toBe(1);
        expect(r.matchesWithPerf).toBe(0);
    });

    test("empty input", () => {
        const r = analyzePersonalMatches([]);
        expect(r.overall.games).toBe(0);
        expect(r.overall.winrate).toBeUndefined();
        expect(r.byPick).toEqual([]);
        expect(r.streaks).toEqual({
            current: undefined,
            longestWin: 0,
            longestLoss: 0,
        });
        expect(r.trends.buckets).toEqual([]);
    });

    test("groups per champion and role, most played first", () => {
        const r = analyzePersonalMatches([
            m(1, true, p()),
            m(2, true, p(), { championKey: "1", role: Role.Top }),
            m(3, false, p(), { championKey: "1", role: Role.Top }),
            m(4, true, p(), { championKey: "103", role: Role.Support }),
        ]);
        expect(
            r.byPick.map((x) => [x.championKey, x.role, x.metrics.games]),
        ).toEqual([
            ["1", Role.Top, 2],
            ["103", Role.Middle, 1],
            ["103", Role.Support, 1],
        ]);
    });
});

describe("recent form", () => {
    test("last 10 and last 20 use the newest matches", () => {
        const matches = Array.from({ length: 25 }, (_, i) =>
            // newest 10 are wins, the rest losses
            m(
                i,
                i >= 15,
                p({ kills: i >= 15 ? 10 : 0, deaths: 1, assists: 0 }),
            ),
        );
        const r = analyzePersonalMatches(matches);
        expect(r.recent.last10.games).toBe(10);
        expect(r.recent.last10.winrate).toBe(1);
        expect(r.recent.last10.kda?.value).toBe(10);
        expect(r.recent.last20.games).toBe(20);
        expect(r.recent.last20.winrate).toBe(0.5);
    });

    test("fewer matches than the window", () => {
        const r = analyzePersonalMatches([m(1, true), m(2, false)]);
        expect(r.recent.last10.games).toBe(2);
        expect(r.recent.last20.games).toBe(2);
        expect(r.recent.last10.winrate).toBe(0.5);
        expect(r.recent.last10.kda).toBeUndefined();
    });
});

describe("trends", () => {
    test("buckets of 10, oldest to newest, last one partial", () => {
        const matches = Array.from({ length: 25 }, (_, i) => m(i, i < 10, p()));
        // Input in newest-first order, as stored.
        const r = analyzePersonalMatches([...matches].reverse());
        expect(r.trends.buckets.map((b) => b.games)).toEqual([10, 10, 5]);
        expect(r.trends.buckets.map((b) => b.winrate)).toEqual([1, 0, 0]);
        expect(r.trends.buckets[0].startTimestamp).toBe(1000);
        expect(r.trends.buckets[2].endTimestamp).toBe(1024);
    });

    test("fewer than 10 matches gives one partial bucket and stable", () => {
        const r = analyzePersonalMatches([m(1, true, p()), m(2, false, p())]);
        expect(r.trends.buckets).toHaveLength(1);
        expect(r.trends.buckets[0].games).toBe(2);
        expect(r.trends.direction.winrate).toBe("stable");
        expect(r.trends.direction.kda).toBe("stable");
    });

    test("direction compares full buckets only", () => {
        // bucket 1: 0 wins, bucket 2: 10 wins, partial bucket ignored.
        const matches = [
            ...Array.from({ length: 10 }, (_, i) => m(i, false, p())),
            ...Array.from({ length: 10 }, (_, i) => m(10 + i, true, p())),
            m(20, false, p()),
        ];
        const r = analyzePersonalMatches(matches);
        expect(r.trends.direction.winrate).toBe("improving");
    });

    test("trendDirection threshold edges", () => {
        expect(TREND_THRESHOLD).toBe(0.05);
        // relative slope = (v2 - v1) / mean: [3,5] -> 0.5 exactly
        expect(trendDirection([3, 5], 0.5)).toBe("stable");
        expect(trendDirection([5, 3], 0.5)).toBe("stable");
        expect(trendDirection([3, 5.01], 0.5)).toBe("improving");
        expect(trendDirection([5.01, 3], 0.5)).toBe("declining");
        expect(trendDirection([4, 4])).toBe("stable");
        expect(trendDirection([4])).toBe("stable");
        expect(trendDirection([])).toBe("stable");
        expect(trendDirection([0, 0])).toBe("stable");
    });
});

describe("streaks", () => {
    test("current streak at the newest end and longest streaks", () => {
        // oldest -> newest: W W W L L W W
        const wins = [true, true, true, false, false, true, true];
        const r = analyzePersonalMatches(wins.map((w, i) => m(i, w)));
        expect(r.streaks.current).toEqual({ type: "win", length: 2 });
        expect(r.streaks.longestWin).toBe(3);
        expect(r.streaks.longestLoss).toBe(2);
    });

    test("streak at the start only", () => {
        const wins = [false, false, false, false, true, false, true];
        const r = analyzePersonalMatches(wins.map((w, i) => m(i, w)));
        expect(r.streaks.longestLoss).toBe(4);
        expect(r.streaks.longestWin).toBe(1);
        expect(r.streaks.current).toEqual({ type: "win", length: 1 });
    });

    test("a loss streak ending now and a single match", () => {
        const r = analyzePersonalMatches([
            m(1, true),
            m(2, false),
            m(3, false),
        ]);
        expect(r.streaks.current).toEqual({ type: "loss", length: 2 });
        const one = analyzePersonalMatches([m(1, false)]);
        expect(one.streaks).toEqual({
            current: { type: "loss", length: 1 },
            longestWin: 0,
            longestLoss: 1,
        });
    });
});

describe("comparison with the champion average", () => {
    const dataset = {
        championData: {
            "103": {
                statsByRole: {
                    [Role.Middle]: { games: 1000, wins: 520 },
                    [Role.Support]: { games: 0, wins: 0 },
                },
            },
        },
    } as any;

    test("compares winrate to the emerald+ average", () => {
        const matches = [m(1, true), m(2, true), m(3, true), m(4, false)];
        const r = analyzePersonalMatches(matches, dataset);
        const c = r.byPick[0].comparison;
        expect(c?.baseline).toBe("average emerald+");
        expect(c?.championWinrate).toBeCloseTo(0.52);
        expect(c?.championGames).toBe(1000);
        expect(c?.delta).toBeCloseTo(0.75 - 0.52);
        expect(r.comparison).toEqual({
            baseline: "average emerald+",
            metrics: ["winrate"],
        });
    });

    test("uses the supplied tier for each champion's rows at 500 games", () => {
        const matches = [
            m(1, true),
            m(2, false),
            m(3, true, p(), { role: Role.Top }),
        ];
        const r = analyzePersonalMatches(matches, undefined, {
            "103": { tier: "gold", games: 500, winrate: 0.5 },
        });
        expect(r.byPick.map((row) => row.comparison)).toEqual([
            {
                baseline: "gold",
                championGames: 500,
                championWinrate: 0.5,
                delta: 0,
            },
            {
                baseline: "gold",
                championGames: 500,
                championWinrate: 0.5,
                delta: 0.5,
            },
        ]);
    });

    test("keeps the emerald+ comparison when the tier has only 499 games", () => {
        const matches = [m(1, true)];
        const before = analyzePersonalMatches(matches, dataset);
        expect(before.byPick[0].comparison?.baseline).toBe("average emerald+");
        expect(
            analyzePersonalMatches(matches, dataset, {
                "103": { tier: "gold", games: 499, winrate: 0.5 },
            }),
        ).toEqual(before);
    });

    test("no comparison when the dataset lacks the champion, the role or games", () => {
        const matches = [
            m(1, true, p(), { championKey: "999" }),
            m(2, true, p(), { role: Role.Support }),
            m(3, true, p(), { role: Role.Top }),
        ];
        const r = analyzePersonalMatches(matches, dataset);
        expect(r.byPick.map((x) => x.comparison)).toEqual([
            undefined,
            undefined,
            undefined,
        ]);
        expect(analyzePersonalMatches(matches).byPick[0].comparison).toBe(
            undefined,
        );
    });
});

describe("determinism", () => {
    test("same input gives the same output and input is not mutated", () => {
        const matches = [m(2, true, p()), m(1, false, p())];
        const copy = JSON.stringify(matches);
        const a = analyzePersonalMatches(matches);
        const b = analyzePersonalMatches(matches);
        expect(a).toEqual(b);
        expect(JSON.stringify(matches)).toBe(copy);
    });
});
