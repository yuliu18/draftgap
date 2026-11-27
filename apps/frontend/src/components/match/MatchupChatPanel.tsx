import {
    For,
    Show,
    batch,
    createEffect,
    createSignal,
    onCleanup,
} from "solid-js";
import { MessageKey } from "@draftgap/core/src/i18n/messages";
import { Role } from "@draftgap/core/src/models/Role";
import {
    MatchupChatInput,
    MatchupPhase,
} from "@draftgap/core/src/llm/matchup-chat";
import { useMatchupChat } from "../../contexts/MatchupChatContext";
import { useI18n } from "../../contexts/I18nContext";
import { useDataset } from "../../contexts/DatasetContext";
import { useUser } from "../../contexts/UserContext";
import { championName } from "../../utils/i18n";
import { ProButton, ProPanel, ProPanelHead } from "../common/Pro";
import { DialogContent, DialogTitle } from "../common/Dialog";

type Pick = { championKey: string; role: Role };

export function MatchupChatPanel(props: {
    class?: string;
    me?: Pick;
    opponent?: Pick;
    phase: MatchupPhase;
    gameId?: number;
    roster?: MatchupChatInput["others"];
    players?: MatchupChatInput["players"];
    loading?: boolean;
}) {
    const chat = useMatchupChat();
    const { t } = useI18n();
    const { dataset } = useDataset();
    const { config } = useUser();
    const [text, setText] = createSignal("");
    const enabled = () =>
        chat.isConfigured() &&
        chat.isReady() &&
        !chat.busy() &&
        !chat.kitsLoading();
    const name = (key: string) => {
        const champ = dataset()?.championData[key];
        return champ ? championName(champ, config) : key;
    };
    createEffect(() =>
        batch(() => {
            chat.setMe(props.me);
            chat.setOpponent(props.opponent);
            chat.setPhase(props.phase);
            chat.setGameId(props.gameId);
            chat.setRoster(props.roster);
            chat.setPlayers(props.players);
        }),
    );
    onCleanup(() =>
        batch(() => {
            chat.setMe(undefined);
            chat.setOpponent(undefined);
            chat.setPhase(undefined);
            chat.setGameId(undefined);
            chat.setRoster(undefined);
            chat.setPlayers(undefined);
        }),
    );

    function submit() {
        if (!enabled() || !text().trim()) return;
        void chat.send(text());
        setText("");
    }

    return (
        <ProPanel class={props.class} aria-label={t("matchupChat.title")}>
            <ProPanelHead
                title={
                    chat.isReady()
                        ? t("matchupChat.heading", {
                              me: name(chat.me()!.championKey),
                              opponent: name(chat.opponent()!.championKey),
                          })
                        : t("matchupChat.title")
                }
                aside={
                    <span class="rounded border border-pg-ln2 bg-pg-s2 px-2 py-0.5">
                        {props.phase === "champ-select"
                            ? t("nav.select")
                            : t(
                                  props.loading
                                      ? "match.loadingPhase"
                                      : "match.live",
                              )}
                    </span>
                }
            />
            <div
                class="flex min-h-32 flex-1 flex-col gap-3 overflow-y-auto p-4"
                role="log"
            >
                <Show when={!chat.isConfigured()}>
                    <p class="text-pg-mu">{t("explain.notConfigured")}</p>
                </Show>
                <Show when={!chat.isReady()}>
                    <p class="text-pg-dim">{t("matchupChat.waiting")}</p>
                </Show>
                <For each={chat.history()}>
                    {(turn) => (
                        <p
                            class="max-w-[90%] whitespace-pre-wrap break-words rounded-lg border px-3 py-2 leading-[18px]"
                            classList={{
                                "self-end border-pg-ac/30 bg-pg-acb":
                                    turn.role === "user",
                                "self-start border-pg-ln bg-pg-s2":
                                    turn.role === "assistant",
                            }}
                        >
                            {turn.content}
                        </p>
                    )}
                </For>
                <Show when={chat.busy()}>
                    <p role="status" class="text-pg-mu">
                        {t("matchupChat.busy")}
                    </p>
                </Show>
                <Show when={chat.error()}>
                    {(error) => (
                        <p role="alert" class="text-pg-neg">
                            {t("matchupChat.error", { error: error() })}
                        </p>
                    )}
                </Show>
            </div>
            <form
                class="flex flex-col gap-2 border-t border-pg-ln px-4 py-3"
                onSubmit={(event) => {
                    event.preventDefault();
                    submit();
                }}
            >
                <div class="flex flex-wrap gap-1">
                    <For each={chat.questions()}>
                        {(question) => (
                            <button
                                type="button"
                                disabled={!enabled()}
                                class="rounded border border-pg-ln2 px-2 py-1 text-left text-[11px] text-pg-mu hover:bg-pg-s2 disabled:opacity-60"
                                onClick={() =>
                                    void chat.send(t(question as MessageKey))
                                }
                            >
                                {t(question as MessageKey)}
                            </button>
                        )}
                    </For>
                </div>
                <div class="flex gap-2">
                    <input
                        aria-label={t("matchupChat.compose")}
                        placeholder={t("matchupChat.compose")}
                        class="h-8 min-w-0 flex-1 rounded-md border border-pg-ln2 bg-pg-bg px-3 focus-visible:outline-pg-ac disabled:opacity-60"
                        disabled={!enabled()}
                        value={text()}
                        onInput={(event) => setText(event.currentTarget.value)}
                    />
                    <ProButton
                        variant="primary"
                        type="submit"
                        disabled={!enabled() || !text().trim()}
                    >
                        {t("matchupChat.send")}
                    </ProButton>
                </div>
                <p class="text-[11px] text-pg-dim">
                    {t("matchupChat.disclaimer")}
                </p>
            </form>
        </ProPanel>
    );
}

export function DraftMatchupChat(props: { me: Pick; opponent: Pick }) {
    const { t } = useI18n();
    return (
        <DialogContent class="block max-w-md bg-pg-bg p-3 font-pro text-[13px] text-pg-tx [&>button:last-child]:right-5 [&>button:last-child]:top-5">
            <DialogTitle class="sr-only">{t("matchupChat.title")}</DialogTitle>
            <MatchupChatPanel
                class="h-[min(36rem,75vh)] [&>div:first-child]:pr-12"
                phase="champ-select"
                me={props.me}
                opponent={props.opponent}
            />
        </DialogContent>
    );
}
