import { Role } from "../models/Role";
import { winrateToRating } from "../rating/ratings";
import { PersonalStats, personalPickKey } from "./personal-stats";

export type PersonalConfig = {
    enabled: boolean;
    priorGames: number;
    unfamiliarPenalty: number;
    familiarGames: number;
    recentFormWeight?: number;
    recentFormPrior?: number;
};

export const DEFAULT_PERSONAL_CONFIG = {
    enabled: true,
    priorGames: 20,
    unfamiliarPenalty: 30,
    familiarGames: 10,
    recentFormWeight: 10, // At most one third of the default unfamiliarity penalty.
    recentFormPrior: 20,
} satisfies PersonalConfig;

export type PersonalRating = {
    rating: number;
    masteryRating: number;
    familiarityRating: number;
    games: number;
    wins: number;
};

export function getPersonalRating(
    stats: PersonalStats,
    championKey: string,
    role: Role,
    config: PersonalConfig,
): PersonalRating {
    const rawBaseline = stats.games === 0 ? 0.5 : stats.wins / stats.games;
    const baseline = Math.min(0.99, Math.max(0.01, rawBaseline));

    const pick = stats.byPick[personalPickKey(championKey, role)];
    const games = pick?.games ?? 0;
    const wins = pick?.wins ?? 0;

    const priorGames = Number.isFinite(config.priorGames)
        ? Math.max(1, config.priorGames)
        : 1;
    const familiarGames = Number.isFinite(config.familiarGames)
        ? Math.max(1, config.familiarGames)
        : 1;
    const shrunk = (wins + priorGames * baseline) / (games + priorGames);

    const masteryRating =
        games === 0 ? 0 : winrateToRating(shrunk) - winrateToRating(baseline);
    const familiarityRating =
        -config.unfamiliarPenalty * Math.max(0, 1 - games / familiarGames);

    const weight =
        config.recentFormWeight ?? DEFAULT_PERSONAL_CONFIG.recentFormWeight;
    const prior =
        config.recentFormPrior ?? DEFAULT_PERSONAL_CONFIG.recentFormPrior;
    const recent = pick?.recent;
    let recentForm = 0;
    if (
        recent &&
        recent.weight > 0 &&
        games > 0 &&
        Number.isFinite(weight) &&
        weight > 0
    ) {
        const formPriorGames = Number.isFinite(prior)
            ? Math.max(1, prior)
            : DEFAULT_PERSONAL_CONFIG.recentFormPrior;
        const deviation = recent.weightedWins / recent.weight - wins / games;
        // Shrink the deviation toward zero using the actual sample size.
        recentForm =
            weight *
            (deviation * (recent.games / (recent.games + formPriorGames)));
    }

    const legacyRating = masteryRating + familiarityRating;
    return {
        rating: recentForm === 0 ? legacyRating : legacyRating + recentForm,
        masteryRating,
        familiarityRating,
        games,
        wins,
    };
}
