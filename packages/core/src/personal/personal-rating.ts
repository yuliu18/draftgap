import { Role } from "../models/Role";
import { winrateToRating } from "../rating/ratings";
import { PersonalStats, personalPickKey } from "./personal-stats";

export type PersonalConfig = {
    enabled: boolean;
    priorGames: number;
    unfamiliarPenalty: number;
    familiarGames: number;
};

export const DEFAULT_PERSONAL_CONFIG: PersonalConfig = {
    enabled: true,
    priorGames: 20,
    unfamiliarPenalty: 30,
    familiarGames: 10,
};

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

    return {
        rating: masteryRating + familiarityRating,
        masteryRating,
        familiarityRating,
        games,
        wins,
    };
}
