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
    mapLcuMatchHistory,
    mergePersonalMatches,
} from "@draftgap/core/src/personal/lcu-match-history";
import { getMatchHistory } from "../api/lcu-api";
import { useDataset } from "./DatasetContext";
import { useMedia } from "../hooks/useMedia";
import {
    parsePersonalMatches,
    serializePersonalMatches,
} from "@draftgap/core/src/personal/personal-storage";

const PERSONAL_MATCHES_KEY = "draftgap-personal-matches";
const SYNC_PAGE_SIZE = 20;
const SYNC_MAX_GAMES = 200;

function createPersonalContext() {
    const { isDesktop } = useMedia();
    const { dataset } = useDataset();
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

    async function syncFromClient() {
        if (!isDesktop) {
            throw new Error(
                "Syncing from the League client needs the desktop app.",
            );
        }
        const championData = dataset()?.championData;
        if (!championData) {
            throw new Error(
                "Champion data is not loaded yet, try again shortly.",
            );
        }
        const championKeyById = (id: number) => {
            const key = id.toString();
            return championData[key] ? key : undefined;
        };

        let merged = matches();
        let imported = 0;
        let read = 0;
        try {
            for (let beg = 0; beg < SYNC_MAX_GAMES; beg += SYNC_PAGE_SIZE) {
                const page = await getMatchHistory(
                    beg,
                    beg + SYNC_PAGE_SIZE - 1,
                );
                if (page === null || page === undefined) break;

                const incoming = mapLcuMatchHistory(page, championKeyById);
                const next = mergePersonalMatches(merged, incoming);
                const added = next.length - merged.length;
                const rawGames = (page as any)?.games?.games;
                if (!Array.isArray(rawGames)) {
                    // The LCU is undocumented: fail loudly instead of
                    // reporting an empty history when its shape changes.
                    throw new Error(
                        `unexpected match history response: ${JSON.stringify(page).slice(0, 200)}`,
                    );
                }
                if (rawGames.length === 0) break;
                read += rawGames.length;
                merged = next;
                imported += added;
                // Stop once a page only holds games we already have. A page of
                // non-ranked games maps to nothing and does not stop the walk.
                if (incoming.length > 0 && added === 0) break;
            }
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            throw new Error(
                `Could not sync from the League client: ${message}`,
            );
        }

        setMatches(merged);
        return { imported, total: merged.length, read };
    }

    return { matches, setMatches, clearMatches, stats, syncFromClient };
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
