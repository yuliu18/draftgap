import {
    JSXElement,
    batch,
    createContext,
    createSignal,
    useContext,
} from "solid-js";
import { Role } from "@draftgap/core/src/models/Role";
import { Suggestion } from "@draftgap/core/src/draft/suggestions";
import { PersonalizedSuggestion } from "@draftgap/core/src/personal/personalize";

export type DisplayedSuggestion = Suggestion & Partial<PersonalizedSuggestion>;

export function createDraftFiltersContext() {
    const [search, setSearch] = createSignal("");
    const [roleFilter, setRoleFilter] = createSignal<Role>();

    const [favouriteFilter, setFavouriteFilter] = createSignal(false);
    // Only picks the player has games on ("Mi pool").
    const [poolFilter, setPoolFilter] = createSignal(false);

    // Rows of the suggestion table in display order (filters and sorting
    // applied), shared with the panels around it.
    const [displayedSuggestions, setDisplayedSuggestions] = createSignal<
        DisplayedSuggestion[]
    >([]);

    function resetDraftFilters() {
        batch(() => {
            setSearch("");
            setRoleFilter(undefined);
            setFavouriteFilter(false);
            setPoolFilter(false);
        });
    }

    return {
        search,
        setSearch,
        roleFilter,
        setRoleFilter,
        favouriteFilter,
        setFavouriteFilter,
        poolFilter,
        setPoolFilter,
        displayedSuggestions,
        setDisplayedSuggestions,
        resetDraftFilters,
    };
}

export const DraftFiltersContext =
    createContext<ReturnType<typeof createDraftFiltersContext>>(undefined);

export function DraftFiltersProvider(props: { children: JSXElement }) {
    const ctx = createDraftFiltersContext();

    return (
        <DraftFiltersContext.Provider value={ctx}>
            {props.children}
        </DraftFiltersContext.Provider>
    );
}

export function useDraftFilters() {
    const useCtx = useContext(DraftFiltersContext);
    if (!useCtx) throw new Error("No DraftFiltersContext found");

    return useCtx;
}
