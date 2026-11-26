import { Role } from "../models/Role";
import { PartialBuildDataset, SkillOrder } from "../models/build/BuildDataset";
import { Dataset } from "../models/dataset/Dataset";
import { ratingToWinrate } from "../rating/ratings";
import { BuildAnalysisResult } from "./analysis";
import { EntityAnalysisResult } from "./entity-analysis";

/**
 * Recommended build: one coherent build plus alternatives for every slot.
 *
 * Selection rule (same for every slot): each option is rated with the rating
 * the build analysis already computes (`totalRating` from `analyzeEntity`:
 * Bayesian-adjusted win rate against the champion's prior, plus matchups).
 * Only options with at least MIN_GAME_SHARE of the champion's games are
 * eligible; the eligible option with the best rating wins and the next
 * ALTERNATIVES ones are listed. If no option is eligible, the most played one
 * is chosen and flagged `lowConfidence`.
 *
 * Out of scope: personalization by the player's own history (stored matches
 * carry no build data).
 */
// 5%: at 1% a shard with 26 games beat one with 2462 in a live check.
export const MIN_GAME_SHARE = 0.05;
export const ALTERNATIVES = 2;

export type BuildChoice<T> = {
    value: T;
    wins: number;
    games: number;
    // Raw (unadjusted) win rate, wins / games.
    rawWinrate: number;
    // Rating from the build analysis and the win rate it maps to.
    rating: number;
    winrate: number;
    lowConfidence: boolean;
};

export type BuildSlot<T> = {
    choice: BuildChoice<T>;
    alternatives: BuildChoice<T>[];
};

export type RecommendedRunes = {
    primaryPathId: number;
    // Keystone (row 0) followed by one rune for rows 1, 2 and 3.
    primary: BuildSlot<number>[];
    secondaryPathId: number;
    // Two runes from two different rows of the secondary path, by row order.
    secondary: BuildSlot<number>[];
    // Stat shard ids: offense, flex, defense.
    shards: BuildSlot<number>[];
};

export type RecommendedBuild = {
    // The champion and role this build was computed for.
    championKey: string;
    role: Role;
    runes?: RecommendedRunes;
    // Summoner spell keys of the best pair.
    summonerSpells?: BuildSlot<number[]>;
    startingItems?: BuildSlot<number[]>;
    boots?: BuildSlot<number>;
    // Up to three items in buying order.
    coreItems: BuildSlot<number>[];
    skillOrder?: BuildSlot<SkillOrder>;
};

export type RecommendedBuildResult =
    | { available: false }
    | { available: true; build: RecommendedBuild };

type Candidate<T> = {
    value: T;
    wins: number;
    games: number;
    result: EntityAnalysisResult | undefined;
};

type Stats = { wins: number; games: number };

function toChoice<T>(
    candidate: Candidate<T>,
    lowConfidence: boolean,
): BuildChoice<T> {
    const rating = candidate.result?.totalRating ?? 0;
    return {
        value: candidate.value,
        wins: candidate.wins,
        games: candidate.games,
        rawWinrate: candidate.wins / candidate.games,
        rating,
        winrate: ratingToWinrate(rating),
        lowConfidence,
    };
}

function rankCandidates<T>(
    candidates: Candidate<T>[],
    championGames: number,
): BuildChoice<T>[] {
    const played = candidates.filter((c) => c.games > 0);
    const eligible = played.filter(
        (c) => c.games / championGames >= MIN_GAME_SHARE && c.result,
    );
    if (eligible.length > 0) {
        return eligible
            .sort(
                (a, b) =>
                    b.result!.totalRating - a.result!.totalRating ||
                    b.games - a.games,
            )
            .map((c) => toChoice(c, false));
    }
    return played
        .sort((a, b) => b.games - a.games)
        .map((c) => toChoice(c, true));
}

function toSlot<T>(ranked: BuildChoice<T>[]): BuildSlot<T> | undefined {
    if (ranked.length === 0) return undefined;
    return {
        choice: ranked[0],
        alternatives: ranked.slice(1, 1 + ALTERNATIVES),
    };
}

function candidatesFrom<T>(
    stats: Record<string, Stats> | undefined,
    results: Record<string, EntityAnalysisResult> | undefined,
    parse: (id: string) => T | undefined,
): Candidate<T>[] {
    const candidates: Candidate<T>[] = [];
    for (const [id, s] of Object.entries(stats ?? {})) {
        const value = parse(id);
        if (value === undefined) continue;
        candidates.push({
            value,
            wins: s.wins,
            games: s.games,
            result: results?.[id],
        });
    }
    return candidates;
}

const parseId = (id: string) => {
    const n = parseInt(id);
    return Number.isNaN(n) ? undefined : n;
};
const parseIdList = (id: string) => {
    const list = id.split("_").map((x) => parseInt(x));
    return list.some((n) => Number.isNaN(n)) ? undefined : list;
};

function runeCandidates(
    stats: Record<string, Stats>,
    results: Record<string, EntityAnalysisResult>,
    accept: (id: number) => boolean,
) {
    return candidatesFrom(stats, results, (id) => {
        const n = parseId(id);
        return n !== undefined && accept(n) ? n : undefined;
    });
}

function recommendRunes(
    dataset: Dataset,
    build: PartialBuildDataset,
    analysis: BuildAnalysisResult["runes"],
): RecommendedRunes | undefined {
    const runes = Object.values(dataset.runeData ?? {});
    const runeById = (id: number) => dataset.runeData?.[id];
    const games = build.games;

    // Keystone first: it decides the primary path.
    const keystones = toSlot(
        rankCandidates(
            runeCandidates(
                build.runes.primary,
                analysis.primary,
                (id) => runeById(id)?.slot === 0,
            ),
            games,
        ),
    );
    if (!keystones) return undefined;
    const primaryPathId = runeById(keystones.choice.value)!.pathId;

    const primary: BuildSlot<number>[] = [keystones];
    for (const row of [1, 2, 3]) {
        const slot = toSlot(
            rankCandidates(
                runeCandidates(build.runes.primary, analysis.primary, (id) => {
                    const r = runeById(id);
                    return r?.pathId === primaryPathId && r.slot === row;
                }),
                games,
            ),
        );
        if (!slot) return undefined;
        primary.push(slot);
    }

    // Secondary: one path, two runes from different rows. Choose the path
    // whose best valid pair is eligible and has the best mean rating.
    type Pair = {
        pathId: number;
        slots: BuildSlot<number>[];
        eligible: boolean;
        score: number;
    };
    let best: Pair | undefined;
    const pathIds = new Set(runes.map((r) => r.pathId));
    for (const pathId of pathIds) {
        if (pathId === primaryPathId) continue;
        const byRow = new Map<number, BuildChoice<number>[]>();
        for (const row of [1, 2, 3]) {
            const ranked = rankCandidates(
                runeCandidates(
                    build.runes.secondary,
                    analysis.secondary,
                    (id) => {
                        const r = runeById(id);
                        return r?.pathId === pathId && r.slot === row;
                    },
                ),
                games,
            );
            if (ranked.length > 0) byRow.set(row, ranked);
        }
        // Best two rows by their top choice.
        const tops = [...byRow.entries()]
            .map(([row, ranked]) => ({ row, ranked }))
            .sort((a, b) => compareChoices(a.ranked[0], b.ranked[0]))
            .slice(0, 2)
            .sort((a, b) => a.row - b.row);
        if (tops.length < 2) continue;
        const eligible = tops.every((t) => !t.ranked[0].lowConfidence);
        const score = tops.reduce(
            (sum, t) =>
                sum + (eligible ? t.ranked[0].rating : t.ranked[0].games) / 2,
            0,
        );
        const pair: Pair = {
            pathId,
            slots: tops.map((t) => toSlot(t.ranked)!),
            eligible,
            score,
        };
        if (
            !best ||
            (pair.eligible && !best.eligible) ||
            (pair.eligible === best.eligible && pair.score > best.score)
        ) {
            best = pair;
        }
    }
    if (!best) return undefined;

    // Shards: one per row (0 offense, 1 flex, 2 defense).
    const shardRows = [
        [0, "offense"],
        [1, "flex"],
        [2, "defense"],
    ] as const;
    const shards: BuildSlot<number>[] = [];
    for (const [row, type] of shardRows) {
        const ids = new Set(
            Object.values(dataset.statShardData ?? {})
                .filter((s) => s.positions.some((p) => p.slot === row))
                .map((s) => s.id),
        );
        const slot = toSlot(
            rankCandidates(
                runeCandidates(
                    build.runes.shards[type],
                    analysis.shards[type],
                    (id) => ids.has(id),
                ),
                games,
            ),
        );
        if (!slot) return undefined;
        shards.push(slot);
    }

    return {
        primaryPathId,
        primary,
        secondaryPathId: best.pathId,
        secondary: best.slots,
        shards,
    };
}

function compareChoices<T>(a: BuildChoice<T>, b: BuildChoice<T>) {
    if (a.lowConfidence !== b.lowConfidence) return a.lowConfidence ? 1 : -1;
    return a.lowConfidence ? b.games - a.games : b.rating - a.rating;
}

export function recommendBuild(
    dataset: Dataset | undefined,
    build: PartialBuildDataset | undefined,
    analysis: BuildAnalysisResult | undefined,
): RecommendedBuildResult {
    if (!dataset || !build || !analysis || !(build.games > 0)) {
        return { available: false };
    }
    const games = build.games;

    const runes = build.runes
        ? recommendRunes(dataset, build, analysis.runes)
        : undefined;

    const summonerSpells = toSlot(
        rankCandidates(
            candidatesFrom(
                build.summonerSpells,
                analysis.summonerSpells,
                parseIdList,
            ),
            games,
        ),
    );

    const startingItems = toSlot(
        rankCandidates(
            candidatesFrom(
                build.items?.startingSets,
                analysis.items.startingSets,
                parseIdList,
            ),
            games,
        ),
    );

    const boots = toSlot(
        rankCandidates(
            candidatesFrom(build.items?.boots, analysis.items.boots, parseId),
            games,
        ),
    );

    // Core items: the best item for buy order 1, 2 and 3. Boots and items
    // already taken for an earlier order are skipped so the build is coherent.
    const coreItems: BuildSlot<number>[] = [];
    const taken = new Set<number>();
    const bootIds = new Set(Object.keys(build.items?.boots ?? {}).map(Number));
    for (let order = 0; order < 3; order++) {
        const slot = toSlot(
            rankCandidates(
                candidatesFrom(
                    build.items?.statsByOrder?.[order],
                    analysis.items.statsByOrder[order],
                    (id) => {
                        const n = parseId(id);
                        return n === undefined || taken.has(n) || bootIds.has(n)
                            ? undefined
                            : n;
                    },
                ),
                games,
            ),
        );
        if (!slot) break;
        taken.add(slot.choice.value);
        coreItems.push(slot);
    }

    const skillOrder = toSlot(
        rankCandidates(
            candidatesFrom(
                build.skills?.order,
                analysis.skills.order,
                (id) => id as SkillOrder,
            ),
            games,
        ),
    );

    const result: RecommendedBuild = {
        championKey: build.championKey,
        role: build.role,
        runes,
        summonerSpells,
        startingItems,
        boots,
        coreItems,
        skillOrder,
    };
    const empty =
        !runes &&
        !summonerSpells &&
        !startingItems &&
        !boots &&
        coreItems.length === 0 &&
        !skillOrder;
    return empty ? { available: false } : { available: true, build: result };
}
