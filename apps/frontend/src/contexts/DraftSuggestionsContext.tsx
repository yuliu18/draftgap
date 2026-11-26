import { JSXElement, createContext, createMemo, useContext } from "solid-js";
import { getSuggestions } from "@draftgap/core/src/draft/suggestions";
import { getBanSuggestions } from "@draftgap/core/src/draft/bans";
import { useDraftAnalysis } from "./DraftAnalysisContext";
import { useDataset } from "./DatasetContext";
import { getVisibleChampionKey, useDraft } from "./DraftContext";
import { useDraftFilters } from "./DraftFiltersContext";
import { useUser } from "./UserContext";
import { usePersonal } from "./PersonalContext";
import { personalizeSuggestions } from "@draftgap/core/src/personal/personalize";

export function createDraftSuggestionsContext() {
    const { isLoaded, dataset, dataset30Days } = useDataset();
    const {
        draftAnalysisConfig,
        allySuggestionTeamComp,
        opponentSuggestionTeamComp,
        analyzeHovers,
    } = useDraftAnalysis();
    const { selection, allyTeam, opponentTeam, allBans } = useDraft();
    const { roleFilter } = useDraftFilters();
    const { config } = useUser();
    const { stats } = usePersonal();

    // The draft state does not identify the local player; the selected ally
    // pick slot is the one being suggested for, so its role is used when known.
    const localRoles = createMemo(() => {
        if (selection.type !== "pick" || selection.team !== "ally") {
            return undefined;
        }
        const role = allyTeam[selection.index]?.role;
        return role === undefined ? undefined : new Set([role]);
    });

    const baseAllySuggestions = createMemo(() => {
        if (!isLoaded()) return [];

        return getSuggestions(
            dataset()!,
            dataset30Days()!,
            allySuggestionTeamComp(),
            opponentSuggestionTeamComp(),
            draftAnalysisConfig(),
        );
    });

    const allySuggestions = createMemo(() =>
        personalizeSuggestions(
            baseAllySuggestions(),
            stats(),
            config.personal,
            localRoles(),
        ),
    );

    const opponentSuggestions = createMemo(() => {
        if (!isLoaded()) return [];

        return getSuggestions(
            dataset()!,
            dataset30Days()!,
            opponentSuggestionTeamComp(),
            allySuggestionTeamComp(),
            draftAnalysisConfig(),
        );
    });

    const banSuggestions = createMemo(() => {
        if (!isLoaded() || selection.type !== "ban" || !selection.team) {
            return [];
        }

        const unavailable = new Set(allBans());
        for (const pick of [...allyTeam, ...opponentTeam]) {
            const key = getVisibleChampionKey(pick, analyzeHovers());
            if (key) unavailable.add(key);
        }

        return getBanSuggestions(
            dataset()!,
            selection.team === "ally"
                ? opponentSuggestions()
                : baseAllySuggestions(),
            unavailable,
            roleFilter(),
        );
    });

    return { allySuggestions, opponentSuggestions, banSuggestions };
}

export const DraftSuggestionsContext =
    createContext<ReturnType<typeof createDraftSuggestionsContext>>();

export function DraftSuggestionsProvider(props: { children: JSXElement }) {
    return (
        <DraftSuggestionsContext.Provider
            value={createDraftSuggestionsContext()}
        >
            {props.children}
        </DraftSuggestionsContext.Provider>
    );
}

export function useDraftSuggestions() {
    const useCtx = useContext(DraftSuggestionsContext);
    if (!useCtx) throw new Error("No DraftSuggestionsContext found");

    return useCtx;
}
