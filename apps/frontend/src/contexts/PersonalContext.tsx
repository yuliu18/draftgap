import { useI18n } from "./I18nContext";
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
import { walkMatchHistory } from "@draftgap/core/src/personal/lcu-sync";
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
    const { t } = useI18n();
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
            throw new Error(t("personal.needDesktop"));
        }
        const championData = dataset()?.championData;
        if (!championData) {
            throw new Error(t("personal.noChampionData"));
        }
        const championKeyById = (id: number) => {
            const key = id.toString();
            return championData[key] ? key : undefined;
        };

        let result;
        try {
            result = await walkMatchHistory(
                getMatchHistory,
                matches(),
                championKeyById,
                { pageSize: SYNC_PAGE_SIZE, maxGames: SYNC_MAX_GAMES },
            );
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            throw new Error(t("personal.syncFailed", { message }));
        }

        const { matches: merged, imported, read, skippedUnknownRole } = result;
        setMatches(merged);
        return { imported, total: merged.length, read, skippedUnknownRole };
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
