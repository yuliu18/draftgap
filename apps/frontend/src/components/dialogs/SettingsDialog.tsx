import { Icon } from "solid-heroicons";
import { questionMarkCircle } from "solid-heroicons/solid-mini";
import { JSX, Show, createSignal, onCleanup, onMount } from "solid-js";
import { ButtonGroup, ButtonGroupOption } from "../common/ButtonGroup";
import { Switch } from "../common/Switch";
import { RiskLevel } from "@draftgap/core/src/risk/risk-level";
import { useUser } from "../../contexts/UserContext";
import { useMedia } from "../../hooks/useMedia";
import {
    DraftTablePlacement,
    StatsSite,
} from "@draftgap/core/src/models/user/Config";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "../common/Dialog";
import { FAQDialog } from "./FAQDialog";
import { PersonalPoolDialog } from "./PersonalPoolDialog";
import { AccountAnalyzerDialog } from "../analyzer/AccountAnalyzerDialog";
import { usePersonal } from "../../contexts/PersonalContext";
import { Button } from "../common/Button";
import { useLlm } from "../../contexts/LlmContext";
import { llmClearApiKey, llmSetApiKey } from "../../api/llm-api";
import { useI18n } from "../../contexts/I18nContext";
import { parsePersonalMatches } from "@draftgap/core/src/personal/personal-storage";
import {
    DEFAULT_RIOT_GAMES,
    MAX_RIOT_GAMES,
} from "@draftgap/core/src/personal/riot-match-history";
import {
    riotDeleteApiKey,
    riotHasApiKey,
    riotSetApiKey,
} from "../../api/riot-api";

const inputClass =
    "rounded-md bg-neutral-900 border border-neutral-700 p-2 text-sm";
const errorDetail = (error: unknown) =>
    error instanceof Error ? error.message : String(error);

function HistoryButton(props: JSX.ButtonHTMLAttributes<HTMLButtonElement>) {
    return <Button {...props} variant="secondary" />;
}

export default function SettingsDialog() {
    const { isDesktop } = useMedia();
    const { config, setConfig } = useUser();
    const { t } = useI18n();
    const {
        matches,
        setMatches,
        clearMatches,
        syncFromClient,
        syncFromRiot,
        riotImportActive,
        clientSyncCount,
    } = usePersonal();
    const [syncing, setSyncing] = createSignal(false);
    const [syncMessage, setSyncMessage] = createSignal<string>();

    async function syncMatches() {
        setSyncing(true);
        setSyncMessage(undefined);
        try {
            const { imported, total, read, skippedUnknownRole } =
                await syncFromClient();
            setSyncMessage(
                t("settings.syncResult", { read, imported, total }) +
                    (skippedUnknownRole > 0
                        ? t("settings.syncSkippedRole", {
                              count: skippedUnknownRole,
                          })
                        : ""),
            );
        } catch (e) {
            setSyncMessage(e instanceof Error ? e.message : String(e));
        } finally {
            setSyncing(false);
        }
    }
    const { hasApiKey, refreshApiKey } = useLlm();
    const [apiKeyInput, setApiKeyInput] = createSignal("");
    const [keyMessage, setKeyMessage] = createSignal<string>();

    async function saveKey() {
        const key = apiKeyInput();
        if (key.trim() === "") return;
        try {
            await llmSetApiKey(key, config.llm.baseUrl);
            setKeyMessage(undefined);
            setApiKeyInput("");
        } catch (e) {
            setKeyMessage(e instanceof Error ? e.message : String(e));
        } finally {
            await refreshApiKey();
        }
    }

    async function removeKey() {
        try {
            await llmClearApiKey();
            setKeyMessage(undefined);
        } catch (e) {
            setKeyMessage(e instanceof Error ? e.message : String(e));
        } finally {
            await refreshApiKey();
        }
    }

    const [riotKey, setRiotKey] = createSignal("");
    const [riotKeyStored, setRiotKeyStored] = createSignal<boolean>();
    const [riotKeyBusy, setRiotKeyBusy] = createSignal(false);
    const [riotKeyError, setRiotKeyError] = createSignal<string>();
    const [riotGames, setRiotGames] = createSignal(String(DEFAULT_RIOT_GAMES));
    const [riotProgress, setRiotProgress] = createSignal<{
        read: number;
        maxGames: number;
    }>();
    const [riotResult, setRiotResult] = createSignal<string>();
    const [riotError, setRiotError] = createSignal<string>();
    const [riotController, setRiotController] = createSignal<AbortController>();
    const [riotCancelling, setRiotCancelling] = createSignal(false);
    const validRiotGames = () => {
        const count = Number(riotGames());
        return Number.isInteger(count) && count >= 1 && count <= MAX_RIOT_GAMES;
    };

    async function updateRiotKey(action?: "save" | "delete") {
        if (riotKeyBusy() || riotImportActive()) return;
        setRiotKeyBusy(true);
        setRiotKeyError(undefined);
        try {
            if (action === "save") await riotSetApiKey(riotKey());
            if (action === "delete") await riotDeleteApiKey();
            if (action) setRiotKey("");
            setRiotKeyStored(await riotHasApiKey());
        } catch (error) {
            setRiotKeyStored(undefined);
            setRiotKeyError(
                t("settings.riot.error", { message: errorDetail(error) }),
            );
        } finally {
            setRiotKeyBusy(false);
        }
    }

    onMount(() => {
        if (isDesktop) void updateRiotKey();
    });
    onCleanup(() => riotController()?.abort());

    async function importFromRiot() {
        if (
            !riotKeyStored() ||
            riotKeyBusy() ||
            riotImportActive() ||
            clientSyncCount() ||
            !validRiotGames()
        )
            return;
        const controller = new AbortController();
        setRiotController(controller);
        setRiotCancelling(false);
        setRiotProgress({ read: 0, maxGames: Number(riotGames()) });
        setRiotResult(undefined);
        setRiotError(undefined);
        try {
            const { read, imported, total, skippedUnknownRole } =
                await syncFromRiot({
                    maxGames: Number(riotGames()),
                    signal: controller.signal,
                    onProgress: setRiotProgress,
                });
            setRiotResult(
                (controller.signal.aborted
                    ? t("settings.riot.cancelled") + " "
                    : "") +
                    t("settings.syncResult", { read, imported, total }) +
                    (skippedUnknownRole
                        ? t("settings.riot.skippedRole", {
                              count: skippedUnknownRole,
                          })
                        : ""),
            );
        } catch (error) {
            setRiotError(
                t("settings.riot.error", { message: errorDetail(error) }),
            );
        } finally {
            setRiotController(undefined);
            setRiotCancelling(false);
            setRiotProgress(undefined);
        }
    }

    const [importText, setImportText] = createSignal("");
    const [importMessage, setImportMessage] = createSignal<string>();

    function importMatches(raw: string) {
        if (riotImportActive()) return;
        const imported = parsePersonalMatches(raw);
        if (imported.length === 0) {
            setImportMessage(t("settings.importNone"));
            return;
        }
        setMatches(imported);
        setImportText("");
        setImportMessage(t("settings.importDone", { count: imported.length }));
    }

    async function importFile(e: Event) {
        const file = (e.currentTarget as HTMLInputElement).files?.[0];
        if (file) importMatches(await file.text());
    }

    const riskLevelOptions: ButtonGroupOption<RiskLevel>[] = RiskLevel.map(
        (level) => ({
            value: level,
            label: t(`risk.${level}`),
        }),
    );

    const draftTablePlacementOptions = [
        {
            value: DraftTablePlacement.Bottom,
            label: t("settings.placement.bottom"),
        },
        {
            value: DraftTablePlacement.InPlace,
            label: t("settings.placement.inPlace"),
        },
        {
            value: DraftTablePlacement.Hidden,
            label: t("settings.placement.hidden"),
        },
    ];

    const statsSiteOptions = [
        {
            value: "lolalytics",
            label: "lolalytics",
        },
        {
            value: "u.gg",
            label: "u.gg",
        },
        {
            value: "op.gg",
            label: "op.gg",
        },
    ] as const;

    return (
        <DialogContent class="pro-settings max-w-[42rem] border-pg-ln bg-pg-s1 font-pro text-[13px] text-pg-tx">
            <DialogHeader>
                <DialogTitle class="text-lg font-semibold normal-case">
                    {t("settings.title")}
                </DialogTitle>
            </DialogHeader>
            <div>
                <h3 class="text-3xl uppercase">
                    {t("settings.section.draft")}
                </h3>
                <div class="flex space-x-16 items-center justify-between mt-2">
                    <span class="text-lg uppercase">
                        {t("settings.ignoreWinrates")}
                    </span>
                    <Switch
                        checked={config.ignoreChampionWinrates}
                        onChange={() =>
                            setConfig({
                                ignoreChampionWinrates:
                                    !config.ignoreChampionWinrates,
                            })
                        }
                    />
                </div>
                <div class="flex items-center mt-1 mb-1 gap-1">
                    <span class="text-lg uppercase block">
                        {t("settings.riskLevel")}
                    </span>
                    <Dialog>
                        <DialogTrigger>
                            <Icon
                                path={questionMarkCircle}
                                class="w-5 inline text-neutral-400 -mt-1"
                            />
                        </DialogTrigger>
                        <FAQDialog />
                    </Dialog>
                </div>
                <ButtonGroup
                    options={riskLevelOptions}
                    selected={config.riskLevel}
                    size="sm"
                    onChange={(value: RiskLevel) =>
                        setConfig({
                            riskLevel: value,
                        })
                    }
                />
            </div>
            <div>
                <h3 class="text-3xl uppercase">{t("settings.section.ui")}</h3>
                <div class="flex space-x-8 items-center justify-between mt-2">
                    <span class="text-lg uppercase">
                        {t("settings.favouritesTop")}
                    </span>
                    <Switch
                        checked={config.showFavouritesAtTop}
                        onChange={() =>
                            setConfig({
                                showFavouritesAtTop:
                                    !config.showFavouritesAtTop,
                            })
                        }
                    />
                </div>

                <Show when={isDesktop}>
                    <div class="flex flex-col gap-1 mt-2">
                        <span class="text-lg uppercase">
                            {t("settings.banPlacement")}
                        </span>
                        <ButtonGroup
                            options={draftTablePlacementOptions}
                            selected={config.banPlacement}
                            size="sm"
                            onChange={(v) =>
                                setConfig({
                                    banPlacement: v,
                                })
                            }
                        />
                    </div>
                    <div class="flex flex-col gap-1 mt-2">
                        <span class="text-lg uppercase">
                            {t("settings.unownedPlacement")}
                        </span>
                        <ButtonGroup
                            options={draftTablePlacementOptions}
                            size="sm"
                            selected={config.unownedPlacement}
                            onChange={(v) =>
                                setConfig({
                                    unownedPlacement: v,
                                })
                            }
                        />
                    </div>
                </Show>

                <div class="flex space-x-8 items-center justify-between mt-2">
                    <span class="text-lg uppercase">
                        {t("settings.advancedWinrates")}
                    </span>
                    <Switch
                        checked={config.showAdvancedWinrates}
                        onChange={() =>
                            setConfig({
                                showAdvancedWinrates:
                                    !config.showAdvancedWinrates,
                            })
                        }
                    />
                </div>
            </div>

            <Show when={isDesktop}>
                <div>
                    <h3 class="text-3xl uppercase">
                        {t("settings.section.client")}
                    </h3>
                    <div class="flex space-x-16 items-center justify-between mt-2">
                        <span class="text-lg uppercase">
                            {t("settings.disableClient")}
                        </span>
                        <Switch
                            checked={config.disableLeagueClientIntegration}
                            onChange={() =>
                                setConfig({
                                    disableLeagueClientIntegration:
                                        !config.disableLeagueClientIntegration,
                                })
                            }
                        />
                    </div>
                </div>
            </Show>

            <div>
                <h3 class="text-3xl uppercase">
                    {t("settings.section.personal")}
                </h3>
                <div class="flex space-x-16 items-center justify-between mt-2">
                    <span class="text-lg uppercase">
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
                <div class="flex items-center justify-between gap-2 mt-2">
                    <span class="text-lg uppercase">
                        {t("settings.storedMatches", {
                            count: matches().length,
                        })}
                    </span>
                    <div class="flex gap-2">
                        <Dialog>
                            <DialogTrigger as={Button} variant="secondary">
                                {t("settings.viewPool")}
                            </DialogTrigger>
                            <PersonalPoolDialog />
                        </Dialog>
                        <Dialog>
                            <DialogTrigger as={Button} variant="secondary">
                                {t("analyzer.open")}
                            </DialogTrigger>
                            <AccountAnalyzerDialog />
                        </Dialog>
                        <HistoryButton
                            disabled={riotImportActive()}
                            onClick={() => {
                                clearMatches();
                                setImportMessage(undefined);
                            }}
                        >
                            {t("settings.clearHistory")}
                        </HistoryButton>
                    </div>
                </div>
                <Show when={isDesktop}>
                    <div class="flex flex-col gap-1 mt-2">
                        <div class="flex items-center gap-2">
                            <HistoryButton
                                class={syncing() ? "opacity-50" : undefined}
                                disabled={riotImportActive()}
                                onClick={() => {
                                    if (!syncing()) void syncMatches();
                                }}
                            >
                                {syncing()
                                    ? t("settings.syncing")
                                    : t("settings.sync")}
                            </HistoryButton>
                            <Show when={syncMessage()}>
                                <span class="text-sm text-neutral-400">
                                    {syncMessage()}
                                </span>
                            </Show>
                        </div>
                    </div>
                    <div class="flex flex-col gap-2 mt-3">
                        <h4 class="text-lg">{t("settings.riot.title")}</h4>
                        <label class="flex flex-col gap-1">
                            {t("settings.apiKey")}
                            <input
                                type="password"
                                autocomplete="off"
                                class={inputClass}
                                disabled={riotKeyBusy() || riotImportActive()}
                                value={riotKey()}
                                onInput={(e) =>
                                    setRiotKey(e.currentTarget.value)
                                }
                            />
                        </label>
                        <div class="flex flex-wrap items-center gap-2">
                            <HistoryButton
                                disabled={
                                    !riotKey().trim() ||
                                    riotKeyBusy() ||
                                    riotImportActive()
                                }
                                onClick={() => void updateRiotKey("save")}
                            >
                                {t("settings.saveKey")}
                            </HistoryButton>
                            <HistoryButton
                                disabled={
                                    riotKeyStored() === false ||
                                    riotKeyBusy() ||
                                    riotImportActive()
                                }
                                onClick={() => void updateRiotKey("delete")}
                            >
                                {t("settings.removeKey")}
                            </HistoryButton>
                            <Show when={riotKeyStored() !== undefined}>
                                <span>
                                    {t("settings.keyStored", {
                                        value: riotKeyStored()
                                            ? t("common.yes")
                                            : t("common.no"),
                                    })}
                                </span>
                            </Show>
                        </div>
                        <Show when={riotKeyError()}>
                            <p role="alert" class="text-red-400">
                                {riotKeyError()}
                            </p>
                        </Show>
                        <label class="flex flex-wrap items-center gap-2">
                            {t("settings.riot.games")}
                            <input
                                type="number"
                                min="1"
                                max={MAX_RIOT_GAMES}
                                step="1"
                                class={inputClass}
                                disabled={riotImportActive()}
                                value={riotGames()}
                                onInput={(e) =>
                                    setRiotGames(e.currentTarget.value)
                                }
                            />
                        </label>
                        <div class="flex flex-wrap items-center gap-2">
                            <HistoryButton
                                disabled={
                                    !riotKeyStored() ||
                                    riotKeyBusy() ||
                                    riotImportActive() ||
                                    !!clientSyncCount() ||
                                    !validRiotGames()
                                }
                                onClick={() => void importFromRiot()}
                            >
                                {t("settings.riot.import")}
                            </HistoryButton>
                            <Show when={riotController()}>
                                <HistoryButton
                                    disabled={riotCancelling()}
                                    onClick={() => {
                                        setRiotCancelling(true);
                                        riotController()?.abort();
                                    }}
                                >
                                    {t("settings.riot.cancel")}
                                </HistoryButton>
                            </Show>
                        </div>
                        <div aria-live="polite">
                            <Show when={riotProgress()} keyed>
                                {(progress) => (
                                    <p>
                                        {t(
                                            riotCancelling()
                                                ? "settings.riot.cancelling"
                                                : "settings.riot.progress",
                                            progress,
                                        )}
                                    </p>
                                )}
                            </Show>
                            <Show when={riotResult()}>
                                <p>{riotResult()}</p>
                            </Show>
                        </div>
                        <Show when={riotError()}>
                            <p role="alert" class="text-red-400">
                                {riotError()}
                            </p>
                        </Show>
                    </div>
                </Show>
                <div class="flex flex-col gap-1 mt-2">
                    <span class="text-lg uppercase">
                        {t("settings.importTitle")}
                    </span>
                    <textarea
                        class="rounded-md bg-neutral-900 border border-neutral-700 p-2 text-sm h-24"
                        placeholder='[{"championKey":"103","role":2,"win":true,"timestamp":1700000000000}]'
                        value={importText()}
                        onInput={(e) => setImportText(e.currentTarget.value)}
                    />
                    <div class="flex items-center gap-2">
                        <HistoryButton
                            disabled={riotImportActive()}
                            onClick={() => importMatches(importText())}
                        >
                            {t("settings.import")}
                        </HistoryButton>
                        <input
                            type="file"
                            accept="application/json,.json"
                            disabled={riotImportActive()}
                            class="text-sm"
                            onChange={importFile}
                        />
                    </div>
                    <Show when={importMessage()}>
                        <span class="text-sm text-neutral-400">
                            {importMessage()}
                        </span>
                    </Show>
                </div>
            </div>

            <Show when={isDesktop}>
                <div>
                    <h3 class="text-3xl uppercase">
                        {t("settings.section.llm")}
                    </h3>
                    <div class="flex space-x-16 items-center justify-between mt-2">
                        <span class="text-lg uppercase">
                            {t("settings.llmEnable")}
                        </span>
                        <Switch
                            checked={config.llm.enabled}
                            onChange={() =>
                                setConfig("llm", "enabled", !config.llm.enabled)
                            }
                        />
                    </div>
                    <div class="flex flex-col gap-1 mt-2">
                        <span class="text-lg uppercase">
                            {t("settings.baseUrl")}
                        </span>
                        <input
                            type="text"
                            class="rounded-md bg-neutral-900 border border-neutral-700 p-2 text-sm"
                            placeholder="https://host/v1"
                            value={config.llm.baseUrl}
                            onInput={(e) =>
                                setConfig(
                                    "llm",
                                    "baseUrl",
                                    e.currentTarget.value,
                                )
                            }
                        />
                        <span class="text-sm text-neutral-400">
                            {t("settings.baseUrl.note")}
                        </span>
                    </div>
                    <div class="flex flex-col gap-1 mt-2">
                        <span class="text-lg uppercase">
                            {t("settings.model")}
                        </span>
                        <input
                            type="text"
                            class="rounded-md bg-neutral-900 border border-neutral-700 p-2 text-sm"
                            value={config.llm.model}
                            onInput={(e) =>
                                setConfig("llm", "model", e.currentTarget.value)
                            }
                        />
                    </div>
                    <div class="flex flex-col gap-1 mt-2">
                        <span class="text-lg uppercase">
                            {t("settings.responseLanguage")}
                        </span>
                        <input
                            type="text"
                            class="rounded-md bg-neutral-900 border border-neutral-700 p-2 text-sm"
                            placeholder={t(
                                "settings.responseLanguage.placeholder",
                            )}
                            value={config.llm.responseLanguage}
                            onInput={(e) =>
                                setConfig(
                                    "llm",
                                    "responseLanguage",
                                    e.currentTarget.value,
                                )
                            }
                        />
                    </div>
                    <div class="flex flex-col gap-1 mt-2">
                        <span class="text-lg uppercase">
                            {t("settings.apiKey")}
                        </span>
                        <input
                            type="password"
                            autocomplete="off"
                            class="rounded-md bg-neutral-900 border border-neutral-700 p-2 text-sm"
                            placeholder={t("settings.apiKey.placeholder")}
                            value={apiKeyInput()}
                            onInput={(e) =>
                                setApiKeyInput(e.currentTarget.value)
                            }
                        />
                        <div class="flex items-center gap-2">
                            <Button
                                variant="secondary"
                                onClick={() => void saveKey()}
                            >
                                {t("settings.saveKey")}
                            </Button>
                            <Button
                                variant="secondary"
                                onClick={() => void removeKey()}
                            >
                                {t("settings.removeKey")}
                            </Button>
                            <span class="text-sm text-neutral-400">
                                {t("settings.keyStored", {
                                    value: hasApiKey()
                                        ? t("common.yes")
                                        : t("common.no"),
                                })}
                            </span>
                        </div>
                        <Show when={keyMessage()}>
                            <span class="text-sm text-red-400">
                                {keyMessage()}
                            </span>
                        </Show>
                    </div>
                </div>
            </Show>

            <div>
                <h3 class="text-3xl uppercase">{t("settings.section.misc")}</h3>
                <div class="flex flex-col gap-1 mt-2">
                    <span class="text-lg uppercase">
                        {t("settings.buildsSite")}
                    </span>
                    <ButtonGroup
                        options={statsSiteOptions}
                        selected={config.defaultStatsSite}
                        size="sm"
                        onChange={(value: StatsSite) =>
                            setConfig({
                                defaultStatsSite: value,
                            })
                        }
                    />
                </div>
            </div>
        </DialogContent>
    );
}
