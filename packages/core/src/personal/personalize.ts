import { Role } from "../models/Role";
import { Suggestion } from "../draft/suggestions";
import { ratingToWinrate } from "../rating/ratings";
import {
    PersonalConfig,
    PersonalRating,
    getPersonalRating,
} from "./personal-rating";
import { PersonalStats } from "./personal-stats";

export type PersonalizedSuggestion = Suggestion & {
    personal: PersonalRating | undefined;
    personalRating: number;
    personalWinrate: number;
};

function identity(suggestion: Suggestion): PersonalizedSuggestion {
    return {
        ...suggestion,
        personal: undefined,
        personalRating: suggestion.draftResult.totalRating,
        personalWinrate: suggestion.draftResult.winrate,
    };
}

export function personalizeSuggestions(
    suggestions: Suggestion[],
    stats: PersonalStats | undefined,
    config: PersonalConfig,
    roles?: ReadonlySet<Role>,
): PersonalizedSuggestion[] {
    if (!config.enabled || !stats || stats.games === 0) {
        return suggestions.map(identity);
    }

    const personalRoles = (role: Role) =>
        roles ? roles.has(role) : stats.gamesByRole[role] > 0;

    const personalized = suggestions.map((suggestion, index) => {
        if (!personalRoles(suggestion.role)) {
            return { index, result: identity(suggestion) };
        }
        const personal = getPersonalRating(
            stats,
            suggestion.championKey,
            suggestion.role,
            config,
        );
        const personalRating =
            suggestion.draftResult.totalRating + personal.rating;
        return {
            index,
            result: {
                ...suggestion,
                personal,
                personalRating,
                personalWinrate: ratingToWinrate(personalRating),
            },
        };
    });

    return personalized
        .sort(
            (a, b) =>
                b.result.personalWinrate - a.result.personalWinrate ||
                a.index - b.index,
        )
        .map((entry) => entry.result);
}
