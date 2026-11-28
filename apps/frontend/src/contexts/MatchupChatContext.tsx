import {
    JSXElement,
    createContext,
    createEffect,
    createMemo,
    createResource,
    createSignal,
    on,
    useContext,
} from "solid-js";
import { displayNameByRole, Role } from "@draftgap/core/src/models/Role";
import {
    createChampionKitLoader,
    ChampionKit,
} from "@draftgap/core/src/llm/champion-kit";
import {
    ChatTurn,
    MatchupChatInput,
    MatchupPhase,
    MatchupSide,
    appendTurn,
    buildMatchupContext,
    matchupStatsFor,
    suggestedQuestions,
    toChatMessages,
} from "@draftgap/core/src/llm/matchup-chat";
import { extractExplanation } from "@draftgap/core/src/llm/explain-prompt";
import {
    resolveMatchupSlots,
    selectAllyMatchupPick,
} from "@draftgap/core/src/llm/matchup-slots";
import { analyzePersonalMatches } from "@draftgap/core/src/personal/analyzer";
import { llmResponseLanguage } from "@draftgap/core/src/i18n/messages";
import { llmChat } from "../api/llm-api";
import { useUser } from "./UserContext";
import { useDataset } from "./DatasetContext";
import { useDraft, getPickedChampionKey } from "./DraftContext";
import { useDraftAnalysis } from "./DraftAnalysisContext";
import { usePersonal } from "./PersonalContext";
import { describeLlmRequest, LlmRequestDetails, useLlm } from "./LlmContext";

const MAX_TURNS = 12;
const MAX_CHARS = 6000;

// One cache per app session, shared by every provider instance.
const loadChampionKit = createChampionKitLoader((url) => fetch(url));

type Slot = { championKey: string; role: Role };

function createMatchupChatContext() {
    const { config } = useUser();
    const { dataset } = useDataset();
    const { allyTeam, opponentTeam, ownAllyIndex, selection, draftFinished } =
        useDraft();
    const { allyTeamComp, opponentTeamComp } = useDraftAnalysis();
    const { matches } = usePersonal();
    const { isConfigured } = useLlm();

    // Overrides; when unset the matchup follows the draft state.
    const [myOverride, setMyOverride] = createSignal<Slot>();
    const [opponentOverride, setOpponentOverride] = createSignal<Slot>();
    const [phaseOverride, setPhaseOverride] = createSignal<MatchupPhase>();
    const [gameIdOverride, setGameIdOverride] = createSignal<number>();

    const [rosterOverride, setRosterOverride] =
        createSignal<MatchupChatInput["others"]>();
    const [playersOverride, setPlayersOverride] =
        createSignal<MatchupChatInput["players"]>();
    const [histories, setHistories] = createSignal(
        new Map<string, readonly ChatTurn[]>(),
    );
    const [busy, setBusy] = createSignal(false);
    const [error, setError] = createSignal<string>();

    const [request, setRequest] = createSignal<{
        key: string;
        details: LlmRequestDetails;
    }>();

    const allyPicks = createMemo(() =>
        allyTeam.map((pick) => ({
            championKey: getPickedChampionKey(pick),
            role: pick.role,
        })),
    );
    const selectedAllyIndex = () =>
        selection.type === "pick" && selection.team === "ally"
            ? selection.index
            : undefined;
    const matchup = createMemo(() => {
        const mine = myOverride();
        return resolveMatchupSlots(
            mine ? [mine] : allyPicks(),
            mine ? 0 : ownAllyIndex(),
            mine ? undefined : selectedAllyIndex(),
            allyTeamComp(),
            opponentTeamComp(),
        );
    });
    const me = () => matchup().me;
    const myChampionKey = () =>
        me()?.championKey ??
        selectAllyMatchupPick(allyPicks(), ownAllyIndex(), selectedAllyIndex())
            ?.championKey;
    const opponent = createMemo(() => {
        const override = opponentOverride();
        if (override) return override;
        const predicted = matchup().opponent;
        // A predicted composition can include hovered champions, not just picks.
        return predicted &&
            opponentTeam.some(
                (pick) => getPickedChampionKey(pick) === predicted.championKey,
            )
            ? predicted
            : undefined;
    });

    const phase = createMemo<MatchupPhase>(
        () => phaseOverride() ?? (draftFinished() ? "in-game" : "champ-select"),
    );

    const matchupKey = createMemo(() => {
        const a = me();
        const b = opponent();
        const currentPhase = phaseOverride();
        if (!a || !b || !currentPhase) return;
        const pair = `${a.championKey}:${a.role}:${b.championKey}:${b.role}`;
        if (currentPhase === "champ-select") return `${currentPhase}:${pair}`;
        // Without a game id the chat still works, keyed by the pair alone.
        const gameId = gameIdOverride();
        return gameId === undefined
            ? `${currentPhase}:${pair}`
            : `${currentPhase}:${gameId}:${pair}`;
    });
    const isReady = () => matchupKey() !== undefined;
    const lastRequest = () => {
        const current = request();
        return current?.key === matchupKey() ? current?.details : undefined;
    };

    const emptyHistory: readonly ChatTurn[] = [];
    const history = () => histories().get(matchupKey() ?? "") ?? emptyHistory;
    const setHistory = (key: string, turns: readonly ChatTurn[]) =>
        setHistories((current) => new Map(current).set(key, turns));

    createEffect(on(matchupKey, () => setError(undefined), { defer: true }));

    const championName = (key: string) =>
        dataset()?.championData[key]?.name ?? key;

    const kitFor = (slot: () => Slot | undefined) => {
        const source = createMemo(() => {
            if (!phaseOverride() || !isConfigured()) return;
            const version = dataset()?.version;
            const pick = slot();
            const id = pick && dataset()?.championData[pick.championKey]?.id;
            return version && id
                ? { version, id, locale: config.language }
                : undefined;
        });
        const [kit] = createResource(source, ({ version, id, locale }) =>
            loadChampionKit(version, locale, id),
        );
        return {
            value: () => (source() ? kit() : undefined),
            loading: () => kit.loading,
        };
    };
    // eslint-disable-next-line solid/reactivity
    const myKit = kitFor(() => me());
    // eslint-disable-next-line solid/reactivity
    const opponentKit = kitFor(() => opponent());
    const kitsLoading = () => myKit.loading() || opponentKit.loading();

    function buildInput(): MatchupChatInput | undefined {
        const data = dataset();
        const mine = me();
        const theirs = opponent();
        if (!data || !mine || !theirs) return undefined;

        const stats = matchupStatsFor(
            data,
            mine.championKey,
            mine.role,
            theirs.championKey,
            theirs.role,
        );
        const side = (
            slot: Slot,
            kit: ChampionKit | undefined,
            overall: { games: number; wins: number },
        ): MatchupSide => ({
            championName: championName(slot.championKey),
            role: displayNameByRole[slot.role],
            kit,
            overall,
        });

        const pick = analyzePersonalMatches(matches(), data).byPick.find(
            (p) => p.championKey === mine.championKey && p.role === mine.role,
        );

        const others = (team: typeof allyTeam, skip: Slot) =>
            team.flatMap((p) => {
                const key = getPickedChampionKey(p);
                return key === undefined ||
                    p.role === undefined ||
                    (key === skip.championKey && p.role === skip.role)
                    ? []
                    : [
                          {
                              championName: championName(key),
                              role: displayNameByRole[p.role],
                          },
                      ];
            });

        return {
            phase: phase(),
            me: side(mine, myKit.value(), stats.mine),
            opponent: side(theirs, opponentKit.value(), stats.theirs),
            matchup: stats.matchup,
            player: pick
                ? {
                      games: pick.metrics.games,
                      wins: pick.metrics.wins,
                      kda: pick.metrics.kda?.value,
                      csPerMin: pick.metrics.csPerMin?.value,
                  }
                : undefined,
            others:
                phase() === "in-game"
                    ? (rosterOverride() ?? {
                          allies: others(allyTeam, mine),
                          enemies: others(opponentTeam, theirs),
                      })
                    : undefined,
            players: phase() === "in-game" ? playersOverride() : undefined,
            responseLanguage: llmResponseLanguage(
                config.llm.responseLanguage,
                config.language,
            ),
        };
    }

    async function send(text: string) {
        const key = matchupKey();
        if (!key || busy() || kitsLoading()) return;
        const input = buildInput();
        if (!input || !isConfigured()) return;
        const withQuestion = appendTurn(history(), "user", text);
        if (withQuestion === history()) return;

        setHistory(key, withQuestion);
        setError(undefined);
        setBusy(true);
        try {
            const baseUrl = config.llm.baseUrl;
            const model = config.llm.model.trim();
            const messages = toChatMessages(
                buildMatchupContext(input),
                withQuestion,
                MAX_TURNS,
                MAX_CHARS,
            );
            setRequest({
                key,
                details: describeLlmRequest(baseUrl, model, messages),
            });
            const response = await llmChat(baseUrl, model, messages);
            const answer = extractExplanation(response);
            setHistory(
                key,
                appendTurn(
                    histories().get(key) ?? emptyHistory,
                    "assistant",
                    answer,
                ),
            );
        } catch (e) {
            if (key === matchupKey()) {
                setError(e instanceof Error ? e.message : String(e));
            }
        } finally {
            setBusy(false);
        }
    }

    const reset = () => {
        const key = matchupKey();
        if (key) setHistory(key, emptyHistory);
        setError(undefined);
    };

    return {
        me,
        myChampionKey,
        opponent,
        lastRequest,
        phase,
        isReady,
        isConfigured,
        history,
        busy,
        kitsLoading,
        error,
        send,
        reset,
        setMe: setMyOverride,
        setOpponent: setOpponentOverride,
        setPhase: setPhaseOverride,
        setGameId: setGameIdOverride,
        setRoster: setRosterOverride,
        setPlayers: setPlayersOverride,
        questions: () => suggestedQuestions(phase()),
    };
}

const MatchupChatContext =
    createContext<ReturnType<typeof createMatchupChatContext>>();

export function MatchupChatProvider(props: { children: JSXElement }) {
    const ctx = createMatchupChatContext();

    return (
        <MatchupChatContext.Provider value={ctx}>
            {props.children}
        </MatchupChatContext.Provider>
    );
}

export function useMatchupChat() {
    const useCtx = useContext(MatchupChatContext);
    if (!useCtx) throw new Error("No MatchupChatContext found");

    return useCtx;
}
