import {
    JSXElement,
    createContext,
    createEffect,
    createMemo,
    createSignal,
    useContext,
} from "solid-js";
import {
    PersonalMatch,
    buildPersonalStats,
} from "@draftgap/core/src/personal/personal-stats";
import {
    parsePersonalMatches,
    serializePersonalMatches,
} from "@draftgap/core/src/personal/personal-storage";

const PERSONAL_MATCHES_KEY = "draftgap-personal-matches";

function createPersonalContext() {
    const [matches, setMatches] = createSignal<PersonalMatch[]>(
        parsePersonalMatches(localStorage.getItem(PERSONAL_MATCHES_KEY)),
    );
    createEffect(() => {
        localStorage.setItem(
            PERSONAL_MATCHES_KEY,
            serializePersonalMatches(matches()),
        );
    });

    const clearMatches = () => setMatches([]);
    const stats = createMemo(() => buildPersonalStats(matches()));

    return { matches, setMatches, clearMatches, stats };
}

const PersonalContext =
    createContext<ReturnType<typeof createPersonalContext>>(undefined);

export function PersonalProvider(props: { children: JSXElement }) {
    const ctx = createPersonalContext();

    return (
        <PersonalContext.Provider value={ctx}>
            {props.children}
        </PersonalContext.Provider>
    );
}

export function usePersonal() {
    const useCtx = useContext(PersonalContext);
    if (!useCtx) throw new Error("No PersonalContext found");

    return useCtx;
}
