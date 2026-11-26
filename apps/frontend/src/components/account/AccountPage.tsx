import { Show, createSignal } from "solid-js";
import { useI18n } from "../../contexts/I18nContext";
import { usePersonal } from "../../contexts/PersonalContext";
import { useUser } from "../../contexts/UserContext";
import { useMedia } from "../../hooks/useMedia";
import { formatPercent } from "../../utils/format";
import { Switch } from "../common/Switch";
import { ProButton, ProPanel, ProPanelHead } from "../common/Pro";
import { AccountAnalyzerContent } from "../analyzer/AccountAnalyzerDialog";
import { PersonalPoolContent } from "../dialogs/PersonalPoolDialog";

function Figure(props: { label: string; value: string }) {
    return (
        <div class="flex-1 border-l border-pg-ln px-4 py-3 first:border-l-0">
            <div class="mb-1 text-[11px] text-pg-dim">{props.label}</div>
            <div class="text-base font-semibold leading-5 tabular-nums">
                {props.value}
            </div>
        </div>
    );
}

/** The Cuenta page: stored history, champion pool and account analyzer. */
export function AccountPage() {
    const { t, localeTag } = useI18n();
    const { config, setConfig } = useUser();
    const { matches, stats, clearMatches, syncFromClient } = usePersonal();
    const { isDesktop } = useMedia();
    const [syncing, setSyncing] = createSignal(false);
    const [message, setMessage] = createSignal<string>();

    async function syncMatches() {
        setSyncing(true);
        setMessage(undefined);
        try {
            const { imported, total, read } = await syncFromClient();
            setMessage(t("settings.syncResult", { read, imported, total }));
        } catch (e) {
            setMessage(e instanceof Error ? e.message : String(e));
        } finally {
            setSyncing(false);
        }
    }

    const record = (games: number, wins: number) =>
        games === 0
            ? "—"
            : `${wins}/${games} · ${formatPercent(wins / games, 1, localeTag())}`;

    return (
        <div class="min-h-0 flex-1 overflow-y-auto">
            <div class="mx-auto flex max-w-[1100px] flex-col gap-4 p-4">
                <ProPanel>
                    <ProPanelHead
                        title={t("account.summary")}
                        aside={
                            <div class="flex items-center gap-2">
                                <span class="text-pg-mu">
                                    {t("settings.personalize")}
                                </span>
                                <Switch
                                    checked={config.personal.enabled}
                                    onChange={() =>
                                        setConfig(
                                            "personal",
                                            "enabled",
                                            !config.personal.enabled,
                                        )
                                    }
                                />
                            </div>
                        }
                    />
                    <div class="flex border-b border-pg-ln">
                        <Figure
                            label={t("account.stored")}
                            value={`${matches().length}`}
                        />
                        <Figure
                            label={t("account.record")}
                            value={record(stats().games, stats().wins)}
                        />
                        <Figure
                            label={t("account.recent")}
                            value={record(
                                stats().recent.games,
                                stats().recent.wins,
                            )}
                        />
                    </div>
                    <div class="flex flex-wrap items-center gap-3 px-4 py-3">
                        <Show when={isDesktop}>
                            <ProButton
                                variant="primary"
                                disabled={syncing()}
                                onClick={() => void syncMatches()}
                            >
                                {syncing()
                                    ? t("settings.syncing")
                                    : t("settings.sync")}
                            </ProButton>
                        </Show>
                        <ProButton
                            onClick={() => {
                                clearMatches();
                                setMessage(undefined);
                            }}
                        >
                            {t("settings.clearHistory")}
                        </ProButton>
                        <Show when={message()}>
                            <span class="text-pg-mu">{message()}</span>
                        </Show>
                    </div>
                </ProPanel>

                <ProPanel>
                    <ProPanelHead title={t("pool.title")} />
                    <div class="p-4">
                        <PersonalPoolContent />
                    </div>
                </ProPanel>

                <ProPanel>
                    <ProPanelHead title={t("analyzer.title")} />
                    <div class="p-4">
                        <AccountAnalyzerContent />
                    </div>
                </ProPanel>
            </div>
        </div>
    );
}
