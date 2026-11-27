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
import { getCurrentSummoner, getMatchHistory } from "../api/lcu-api";
import {
    riotGetAccount,
    riotGetClientRegion,
    riotGetMatch,
    riotGetMatchIds,
    riotHasApiKey,
} from "../api/riot-api";
import {
    createRiotRequestBudget,
    importRiotHistory,
    riotRegionForPlatform,
    type RiotRegion,
} from "@draftgap/core/src/personal/riot-match-history";
import { mergePersonalMatches } from "@draftgap/core/src/personal/lcu-match-history";
import { useDataset } from "./DatasetContext";
import { useMedia } from "../hooks/useMedia";
import {
    parsePersonalMatches,
    serializePersonalMatches,
} from "@draftgap/core/src/personal/personal-storage";

const PERSONAL_MATCHES_KEY = "draftgap-personal-matches";
const SYNC_PAGE_SIZE = 20;
const SYNC_MAX_GAMES = 200;

function sleep(ms: number, signal?: AbortSignal) {
    return new Promise<void>((resolve) => {
        if (signal?.aborted) return resolve();
        const finish = () => {
            clearTimeout(timer);
            signal?.removeEventListener("abort", finish);
            resolve();
        };
        const timer = setTimeout(finish, Math.min(ms, 2_147_483_647));
        signal?.addEventListener("abort", finish, { once: true });
    });
}

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

    const [riotImportActive, setRiotImportActive] = createSignal(false);
    const [clientSyncCount, setClientSyncCount] = createSignal(0);
    const riotBudgets = new Map<
        RiotRegion,
        ReturnType<typeof createRiotRequestBudget>
    >();
    const clearMatches = () => {
        if (!riotImportActive()) setMatches([]);
    };
    const stats = createMemo(() => buildPersonalStats(matches()));

    function getChampionLookup() {
        const championData = dataset()?.championData;
        if (!championData) {
            throw new Error(t("personal.noChampionData"));
        }
        return (id: number) => {
            const key = id.toString();
            return championData[key] ? key : undefined;
        };
    }

    async function syncFromClient() {
        if (!isDesktop) {
            throw new Error(t("personal.needDesktop"));
        }
        if (riotImportActive()) throw new Error(t("settings.riot.busy"));
        const championKeyById = getChampionLookup();

        let result;
        setClientSyncCount((count) => count + 1);
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
        } finally {
            setClientSyncCount((count) => count - 1);
        }

        const { matches: merged, imported, read, skippedUnknownRole } = result;
        setMatches(merged);
        return { imported, total: merged.length, read, skippedUnknownRole };
    }

    async function syncFromRiot(
        options: Omit<
            Parameters<typeof importRiotHistory>[1],
            "gameName" | "tagLine"
        >,
    ) {
        if (!isDesktop) throw new Error(t("personal.needDesktop"));
        if (riotImportActive() || clientSyncCount())
            throw new Error(t("settings.riot.busy"));
        setRiotImportActive(true);
        const empty = () => ({
            read: 0,
            imported: 0,
            total: matches().length,
            skippedUnknownRole: 0,
        });
        try {
            if (options.signal?.aborted) return empty();
            if (!(await riotHasApiKey()))
                throw new Error(t("settings.riot.needKey"));
            if (options.signal?.aborted) return empty();
            const championKeyById = getChampionLookup();
            const [summoner, platform] = await Promise.all([
                getCurrentSummoner().catch(() => null),
                riotGetClientRegion().catch(() => null),
            ]);
            if (options.signal?.aborted) return empty();
            if (!summoner || !platform)
                throw new Error(t("settings.riot.openClient"));
            const region = riotRegionForPlatform(platform);
            if (!region) throw new Error(t("settings.riot.unknownRegion"));
            // These fields are newer than the community LCU declaration.
            const gameName =
                "gameName" in summoner ? summoner.gameName : undefined;
            const tagLine =
                "tagLine" in summoner ? summoner.tagLine : undefined;
            if (
                typeof gameName !== "string" ||
                !gameName.trim() ||
                typeof tagLine !== "string" ||
                !tagLine.trim()
            ) {
                throw new Error(t("settings.riot.noRiotId"));
            }
            const budget = riotBudgets.get(region) ?? createRiotRequestBudget();
            riotBudgets.set(region, budget);
            return await importRiotHistory(
                {
                    getAccount: (name, tag) =>
                        riotGetAccount(region, name, tag),
                    getMatchIds: (puuid, start, count) =>
                        riotGetMatchIds(region, puuid, start, count),
                    getMatch: (id) => riotGetMatch(region, id),
                    now: () => performance.now(),
                    sleep,
                    budget,
                    championKeyById,
                    getMatches: matches,
                    mergeMatches: (incoming) =>
                        setMatches((existing) =>
                            mergePersonalMatches(existing, incoming),
                        ),
                },
                { ...options, gameName, tagLine },
            );
        } finally {
            setRiotImportActive(false);
        }
    }

    return {
        matches,
        setMatches,
        clearMatches,
        stats,
        syncFromClient,
        syncFromRiot,
        riotImportActive,
        clientSyncCount,
    };
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
