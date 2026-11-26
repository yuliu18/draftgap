import { Suggestion } from "@draftgap/core/src/draft/suggestions";
import { getStats } from "@draftgap/core/src/draft/utils";
import { Dataset } from "@draftgap/core/src/models/dataset/Dataset";
import { Role } from "@draftgap/core/src/models/Role";
import { ratingToWinrate } from "@draftgap/core/src/rating/ratings";

export type LaneMatchup = {
    opponentKey: string;
    /** Matchup rating over expectation, as winrate points (0.5 = even). */
    delta: number | undefined;
    /** Raw matchup winrate (0..1) from the 30 day dataset, same pairing as the analysis. */
    winrate: number | undefined;
};

/** The suggestion against the champion the other team has in the same role. */
export function getLaneMatchup(
    suggestion: Suggestion,
    enemyComp: ReadonlyMap<Role, string>,
    fullDataset: Dataset | undefined,
): LaneMatchup | undefined {
    const opponentKey = enemyComp.get(suggestion.role);
    if (!opponentKey) return undefined;

    const result = suggestion.draftResult.matchupRating.matchupResults.find(
        (r) =>
            r.roleA === suggestion.role &&
            r.championKeyA === suggestion.championKey &&
            r.roleB === suggestion.role &&
            r.championKeyB === opponentKey,
    );
    const delta = result
        ? (ratingToWinrate(result.rating) - 0.5) * 100
        : undefined;

    let winrate: number | undefined;
    if (fullDataset) {
        const mine = getStats(
            fullDataset,
            suggestion.championKey,
            suggestion.role,
            "matchup",
            suggestion.role,
            opponentKey,
        );
        const theirs = getStats(
            fullDataset,
            opponentKey,
            suggestion.role,
            "matchup",
            suggestion.role,
            suggestion.championKey,
        );
        const games = (mine.games + theirs.games) / 2;
        if (games > 0) {
            winrate = (mine.wins + (theirs.games - theirs.wins)) / 2 / games;
        }
    }

    return { opponentKey, delta, winrate };
}
