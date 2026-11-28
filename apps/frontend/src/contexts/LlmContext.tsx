import {
    JSXElement,
    createContext,
    createEffect,
    createMemo,
    createSignal,
    useContext,
} from "solid-js";
import { Role, displayNameByRole } from "@draftgap/core/src/models/Role";
import { Suggestion } from "@draftgap/core/src/draft/suggestions";
import { PersonalizedSuggestion } from "@draftgap/core/src/personal/personalize";
import {
    ExplainInput,
    ExplainOption,
    ExplainPick,
    buildExplainMessages,
    canExplain,
    extractExplanation,
} from "@draftgap/core/src/llm/explain-prompt";
import { llmChat, llmHasApiKey } from "../api/llm-api";
import { useMedia } from "../hooks/useMedia";
import { useUser } from "./UserContext";
import { useI18n } from "./I18nContext";
import { llmResponseLanguage } from "@draftgap/core/src/i18n/messages";
import { useDataset } from "./DatasetContext";
import { useDraft } from "./DraftContext";
import { useDraftAnalysis } from "./DraftAnalysisContext";
import { useDraftFilters } from "./DraftFiltersContext";
import { usePersonal } from "./PersonalContext";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const MAX_EXPLAIN_OPTIONS = 5;

type RequestMessages = Parameters<typeof llmChat>[2];
export type LlmRequestDetails = {
    model: string;
    host: string;
    messages: ReadonlyArray<Readonly<RequestMessages[number]>>;
};

export function describeLlmRequest(
    baseUrl: string,
    model: string,
    messages: RequestMessages,
): LlmRequestDetails {
    let host = "";
    try {
        host = new URL(baseUrl.trim()).host;
    } catch {
        // Never show the raw URL, even when it cannot be parsed.
    }
    return { model, host, messages };
}

export function isLocalBaseUrl(baseUrl: string) {
    try {
        return LOCAL_HOSTS.has(new URL(baseUrl.trim()).hostname);
    } catch {
        return false;
    }
}

function createLlmContext() {
    const { isDesktop } = useMedia();
    const { config } = useUser();
    const { t } = useI18n();
    const { dataset } = useDataset();
    const { selection, allyTeam } = useDraft();
    const { allySuggestionTeamComp, opponentSuggestionTeamComp } =
        useDraftAnalysis();
    const { roleFilter } = useDraftFilters();
    const { stats } = usePersonal();
    const [lastRequest, setLastRequest] = createSignal<LlmRequestDetails>();

    type KeyStatus = { stored: boolean } | { error: string };
    const [keyStatus, setKeyStatus] = createSignal<KeyStatus>();
    const hasApiKey = () => {
        const status = keyStatus();
        return status && "stored" in status ? status.stored : undefined;
    };
    const keyStatusError = () => {
        const status = keyStatus();
        return status && "error" in status ? status.error : undefined;
    };

    let latestKeyRequest = 0;
    async function refreshApiKey() {
        if (!isDesktop) return;
        const request = ++latestKeyRequest;
        setKeyStatus(undefined);
        let status: KeyStatus;
        try {
            status = { stored: await llmHasApiKey(config.llm.baseUrl) };
        } catch (error) {
            status = {
                error: error instanceof Error ? error.message : String(error),
            };
        }
        // Only the latest request may answer; an older one is stale.
        if (request === latestKeyRequest) setKeyStatus(status);
    }
    // Re-asked whenever the base URL changes: a key belongs to one endpoint.
    createEffect(() => {
        void config.llm.baseUrl;
        void refreshApiKey();
    });

    const isConfigured = createMemo(
        () =>
            isDesktop &&
            config.llm.enabled &&
            config.llm.baseUrl.trim() !== "" &&
            config.llm.model.trim() !== "" &&
            (hasApiKey() || isLocalBaseUrl(config.llm.baseUrl)),
    );

    const championName = (key: string) =>
        dataset()?.championData[key]?.name ?? key;

    const toPicks = (comp: Map<Role, string>): ExplainPick[] =>
        [...comp.entries()]
            .sort(([a], [b]) => a - b)
            .map(([role, key]) => ({
                championName: championName(key),
                role: displayNameByRole[role],
            }));

    function toOption(
        suggestion: Suggestion & Partial<PersonalizedSuggestion>,
    ): ExplainOption {
        const result = suggestion.draftResult;
        const personal = suggestion.personal;
        return {
            championName: championName(suggestion.championKey),
            role: displayNameByRole[suggestion.role],
            winrate: suggestion.personalWinrate ?? result.winrate,
            championRating: result.allyChampionRating.totalRating,
            duoRating: result.allyDuoRating.totalRating,
            matchupRating: result.matchupRating.totalRating,
            personalMastery: personal?.masteryRating,
            personalFamiliarity: personal?.familiarityRating,
            personalGames: personal?.games,
            personalWins: personal?.wins,
        };
    }

    /** `suggestions` are the table rows in the order they are displayed. */
    function buildInput(
        suggestions: (Suggestion & Partial<PersonalizedSuggestion>)[],
    ): ExplainInput {
        const slotRole =
            selection.type === "pick" && selection.team === "ally"
                ? allyTeam[selection.index]?.role
                : undefined;
        const pickingRole = roleFilter() ?? slotRole;
        const personalStats = stats();

        return {
            allyPicks: toPicks(allySuggestionTeamComp()),
            enemyPicks: toPicks(opponentSuggestionTeamComp()),
            pickingRole:
                pickingRole === undefined
                    ? undefined
                    : displayNameByRole[pickingRole],
            options: suggestions.slice(0, MAX_EXPLAIN_OPTIONS).map(toOption),
            personal:
                personalStats.games > 0
                    ? {
                          overall: {
                              games: personalStats.games,
                              wins: personalStats.wins,
                          },
                          recent: personalStats.recent,
                      }
                    : undefined,
            responseLanguage: llmResponseLanguage(
                config.llm.responseLanguage,
                config.language,
            ),
            maxOptions: MAX_EXPLAIN_OPTIONS,
        };
    }

    async function explain(
        suggestions: (Suggestion & Partial<PersonalizedSuggestion>)[],
    ) {
        const input = buildInput(suggestions);
        if (!canExplain(input)) {
            throw new Error(t("explain.noSuggestions"));
        }
        const baseUrl = config.llm.baseUrl;
        const model = config.llm.model.trim();
        const messages = buildExplainMessages(input);
        setLastRequest(describeLlmRequest(baseUrl, model, messages));
        const response = await llmChat(baseUrl, model, messages);
        return extractExplanation(response);
    }

    return {
        hasApiKey,
        keyStatusError,
        refreshApiKey,
        isConfigured,
        explain,
        lastRequest,
    };
}

const LlmContext = createContext<ReturnType<typeof createLlmContext>>();

export function LlmProvider(props: { children: JSXElement }) {
    const ctx = createLlmContext();

    return (
        <LlmContext.Provider value={ctx}>{props.children}</LlmContext.Provider>
    );
}

export function useLlm() {
    const useCtx = useContext(LlmContext);
    if (!useCtx) throw new Error("No LlmContext found");

    return useCtx;
}
