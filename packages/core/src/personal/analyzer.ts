import { Role } from "../models/Role";
import { PersonalMatch, PersonalPerf } from "./personal-stats";

export const TREND_BUCKET_SIZE = 10;
/**
 * A metric is "improving"/"declining" when the least-squares slope across
 * the full buckets, relative to the mean value, exceeds this fraction per
 * bucket (5% of the mean per 10 matches). A slope exactly at the threshold
 * counts as stable.
 */
export const TREND_THRESHOLD = 0.05;

export const COMPARISON_BASELINE = "average emerald+";
/** The dataset only has champion+role winrates, no per-minute averages. */
export const COMPARISON_METRICS = ["winrate"] as const;

export type Metric = { value: number; sample: number };
export type TrendDirection = "improving" | "stable" | "declining";

export type PickMetrics = {
    games: number;
    wins: number;
    winrate?: number;
    /** (kills + assists) / max(1, deaths) over summed totals. */
    kda?: Metric;
    kills?: Metric;
    deaths?: Metric;
    assists?: Metric;
    csPerMin?: Metric;
    goldPerMin?: Metric;
    damagePerMin?: Metric;
    visionPerMin?: Metric;
    /** Average game length in seconds. */
    duration?: Metric;
};

export type DatasetLike = {
    championData: Record<
        string,
        | {
              statsByRole: Record<
                  number,
                  { games: number; wins: number } | undefined
              >;
          }
        | undefined
    >;
};

export type ChampionBaseline = { tier: string; winrate: number; games: number };
export type ChampionBaselines = Readonly<
    Record<string, ChampionBaseline | undefined>
>;
const MIN_TIER_BASELINE_GAMES = 500;

export type PickComparison = {
    baseline: string;
    championWinrate: number;
    championGames: number;
    /** Player winrate minus champion average winrate. */
    delta: number;
};

export type PickAnalysis = {
    championKey: string;
    role: Role;
    metrics: PickMetrics;
    comparison?: PickComparison;
};

export type TrendBucket = PickMetrics & {
    startTimestamp: number;
    endTimestamp: number;
};

export type TrendKey =
    | "winrate"
    | "kda"
    | "csPerMin"
    | "damagePerMin"
    | "visionPerMin";

export type Streaks = {
    current?: { type: "win" | "loss"; length: number };
    longestWin: number;
    longestLoss: number;
};

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * Direction of a series ordered oldest to newest: the least-squares slope
 * relative to the mean magnitude, against `threshold` (strictly greater).
 */
export function trendDirection(
    values: number[],
    threshold = TREND_THRESHOLD,
): TrendDirection {
    if (values.length < 2) return "stable";
    const xs = values.map((_, i) => i);
    const mx = mean(xs);
    const my = mean(values);
    if (my === 0) return "stable";
    let num = 0;
    let den = 0;
    for (let i = 0; i < values.length; i++) {
        num += (xs[i] - mx) * (values[i] - my);
        den += (xs[i] - mx) ** 2;
    }
    const relative = num / den / Math.abs(my);
    if (relative > threshold) return "improving";
    if (relative < -threshold) return "declining";
    return "stable";
}

function metric(value: number, sample: number): Metric {
    return { value, sample };
}

type Perfed<K extends keyof PersonalPerf> = PersonalMatch & {
    perf: PersonalPerf & Required<Pick<PersonalPerf, K>>;
};

function withFields<K extends keyof PersonalPerf>(
    matches: PersonalMatch[],
    ...fields: K[]
) {
    return matches.filter(
        (m) =>
            m.perf !== undefined &&
            fields.every((f) => m.perf![f] !== undefined),
    ) as Perfed<K>[];
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function computeMetrics(matches: PersonalMatch[]): PickMetrics {
    const wins = matches.filter((m) => m.win).length;
    const result: PickMetrics = {
        games: matches.length,
        wins,
        winrate: matches.length === 0 ? undefined : wins / matches.length,
    };

    const kda = withFields(matches, "kills", "deaths", "assists");
    if (kda.length > 0) {
        const k = sum(kda.map((m) => m.perf.kills));
        const d = sum(kda.map((m) => m.perf.deaths));
        const a = sum(kda.map((m) => m.perf.assists));
        result.kda = metric((k + a) / Math.max(1, d), kda.length);
    }
    for (const [key, field] of [
        ["kills", "kills"],
        ["deaths", "deaths"],
        ["assists", "assists"],
    ] as const) {
        const ms = withFields(matches, field);
        if (ms.length > 0) {
            result[key] = metric(mean(ms.map((m) => m.perf[field])), ms.length);
        }
    }

    // Per-minute metrics: total of the stat over total minutes played, over
    // the matches that have both the stat and a positive duration.
    for (const [key, field] of [
        ["csPerMin", "cs"],
        ["goldPerMin", "gold"],
        ["damagePerMin", "damage"],
        ["visionPerMin", "vision"],
    ] as const) {
        const ms = withFields(matches, field, "duration").filter(
            (m) => m.perf.duration > 0,
        );
        if (ms.length > 0) {
            const minutes = sum(ms.map((m) => m.perf.duration)) / 60;
            result[key] = metric(
                sum(ms.map((m) => m.perf[field])) / minutes,
                ms.length,
            );
        }
    }

    const timed = withFields(matches, "duration").filter(
        (m) => m.perf.duration > 0,
    );
    if (timed.length > 0) {
        result.duration = metric(
            mean(timed.map((m) => m.perf.duration)),
            timed.length,
        );
    }
    return result;
}

function streaksOf(newestFirst: PersonalMatch[]): Streaks {
    let longestWin = 0;
    let longestLoss = 0;
    let run = 0;
    let runType: boolean | undefined;
    for (const match of newestFirst) {
        run = match.win === runType ? run + 1 : 1;
        runType = match.win;
        if (match.win) longestWin = Math.max(longestWin, run);
        else longestLoss = Math.max(longestLoss, run);
    }

    let current: Streaks["current"];
    if (newestFirst.length > 0) {
        const type = newestFirst[0].win;
        let length = 0;
        while (
            length < newestFirst.length &&
            newestFirst[length].win === type
        ) {
            length++;
        }
        current = { type: type ? "win" : "loss", length };
    }
    return { current, longestWin, longestLoss };
}

const TREND_KEYS: TrendKey[] = [
    "winrate",
    "kda",
    "csPerMin",
    "damagePerMin",
    "visionPerMin",
];

function trendValue(bucket: PickMetrics, key: TrendKey) {
    return key === "winrate" ? bucket.winrate : bucket[key]?.value;
}

/**
 * Pure and deterministic: no clock is read. Matches may come in any order;
 * they are sorted by timestamp internally and the input is not mutated.
 */
export function analyzePersonalMatches(
    matches: PersonalMatch[],
    dataset?: DatasetLike,
    baselines?: ChampionBaselines,
) {
    const oldestFirst = [...matches].sort((a, b) => a.timestamp - b.timestamp);
    const newestFirst = [...oldestFirst].reverse();

    const groups = new Map<string, PersonalMatch[]>();
    for (const match of oldestFirst) {
        const key = `${match.championKey}:${match.role}`;
        const group = groups.get(key) ?? [];
        group.push(match);
        groups.set(key, group);
    }
    const byPick: PickAnalysis[] = [...groups.values()]
        .map((group) => {
            const { championKey, role } = group[0];
            const metrics = computeMetrics(group);
            const tier = baselines?.[championKey];
            const average =
                dataset?.championData[championKey]?.statsByRole[role];
            const baseline =
                tier && tier.games >= MIN_TIER_BASELINE_GAMES
                    ? tier
                    : average && average.games > 0
                      ? {
                            tier: COMPARISON_BASELINE,
                            winrate: average.wins / average.games,
                            games: average.games,
                        }
                      : undefined;
            const comparison: PickComparison | undefined =
                baseline && metrics.winrate !== undefined
                    ? {
                          baseline: baseline.tier,
                          championWinrate: baseline.winrate,
                          championGames: baseline.games,
                          delta: metrics.winrate - baseline.winrate,
                      }
                    : undefined;
            return { championKey, role, metrics, comparison };
        })
        .sort(
            (a, b) =>
                b.metrics.games - a.metrics.games ||
                a.championKey.localeCompare(b.championKey) ||
                a.role - b.role,
        );

    const buckets: TrendBucket[] = [];
    for (let i = 0; i < oldestFirst.length; i += TREND_BUCKET_SIZE) {
        const chunk = oldestFirst.slice(i, i + TREND_BUCKET_SIZE);
        buckets.push({
            ...computeMetrics(chunk),
            startTimestamp: chunk[0].timestamp,
            endTimestamp: chunk[chunk.length - 1].timestamp,
        });
    }
    // A partial bucket is shown but never counts towards the direction.
    const full = buckets.filter((b) => b.games === TREND_BUCKET_SIZE);
    const direction = Object.fromEntries(
        TREND_KEYS.map((key) => [
            key,
            trendDirection(
                full
                    .map((b) => trendValue(b, key))
                    .filter((v): v is number => v !== undefined),
            ),
        ]),
    ) as Record<TrendKey, TrendDirection>;

    const form = (n: number) => computeMetrics(newestFirst.slice(0, n));

    return {
        overall: computeMetrics(oldestFirst),
        matchesWithPerf: matches.filter((m) => m.perf !== undefined).length,
        byPick,
        recent: { last10: form(10), last20: form(20) },
        trends: { buckets, direction },
        streaks: streaksOf(newestFirst),
        comparison: {
            baseline: COMPARISON_BASELINE,
            metrics: [...COMPARISON_METRICS],
        },
    };
}

export type AccountAnalysis = ReturnType<typeof analyzePersonalMatches>;
