import { createMemo } from "solid-js";
import { useDraft } from "../contexts/DraftContext";
import { useDraftAnalysis } from "../contexts/DraftAnalysisContext";
import { useDraftFilters } from "../contexts/DraftFiltersContext";
import { useDraftSuggestions } from "../contexts/DraftSuggestionsContext";

/**
 * The option the side panels talk about: the champion in the selected slot
 * when it has one, else the first option on display. `team` is the side the
 * options are for and `enemyComp` the comp it faces.
 */
export function createFocusSuggestion() {
    const { selection, selectedChampionKey } = useDraft();
    const {
        allyTeamComp,
        opponentTeamComp,
        allySuggestionTeamComp,
        opponentSuggestionTeamComp,
    } = useDraftAnalysis();
    const { allySuggestions, opponentSuggestions } = useDraftSuggestions();
    const { displayedSuggestions } = useDraftFilters();

    const team = () =>
        selection.type === "pick" && selection.team ? selection.team : "ally";
    const enemyComp = () =>
        team() === "opponent"
            ? allySuggestionTeamComp()
            : opponentSuggestionTeamComp();

    const focus = createMemo(() => {
        const all =
            team() === "ally" ? allySuggestions() : opponentSuggestions();
        const key =
            selection.type === "pick" ? selectedChampionKey() : undefined;
        if (key) {
            const comp =
                team() === "ally" ? allyTeamComp() : opponentTeamComp();
            const role = [...comp.entries()].find(([, k]) => k === key)?.[0];
            const found = all.find(
                (s) =>
                    s.championKey === key &&
                    (role === undefined || s.role === role),
            );
            if (found) return found;
        }
        return displayedSuggestions()[0];
    });

    return { team, enemyComp, focus };
}
