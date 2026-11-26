import { For, JSX, Show, createMemo } from "solid-js";
import { Icon } from "solid-heroicons";
import { star } from "solid-heroicons/solid";
import { arrowLeft } from "solid-heroicons/solid-mini";
import { useDraft } from "../../contexts/DraftContext";
import { useDraftFilters } from "../../contexts/DraftFiltersContext";
import { useDraftView } from "../../contexts/DraftViewContext";
import { useDataset } from "../../contexts/DatasetContext";
import { useI18n } from "../../contexts/I18nContext";
import { useUser } from "../../contexts/UserContext";
import { usePersonal } from "../../contexts/PersonalContext";
import { useMedia } from "../../hooks/useMedia";
import { createFocusSuggestion } from "../../hooks/createFocusSuggestion";
import { getLaneMatchup } from "../../utils/lane-matchup";
import { championName } from "../../utils/i18n";
import { formatDuration, formatPercent } from "../../utils/format";
import { cn } from "../../utils/style";
import AnalysisView from "../views/analysis/AnalysisView";
import DraftTable from "./DraftTable";
import BanTable from "./BanTable";
import { RoleFilter } from "./RoleFilter";
import { Search } from "./Search";
import { TeamSelector } from "./TeamSelector";
import { TeamStrip } from "./TeamStrip";
import { FilterMenu } from "./FilterMenu";
import { AnalyzeHoverToggle } from "./AnalyzeHoverToggle";
import { CompositionPanel } from "./CompositionPanel";
import { LanePanel } from "./LanePanel";
import { ProButton, ProPanel, ProPanelHead, Seg } from "../common/Pro";

const FORM_GAMES = 10;

function FooterCard(props: {
    label: string;
    children: JSX.Element;
    class?: string;
}) {
    return (
        <div
            class={cn(
                "flex-1 border-l border-pg-ln px-4 py-3 first:border-l-0",
                props.class,
            )}
        >
            <div class="mb-1 text-[11px] text-pg-dim">{props.label}</div>
            <div class="flex h-5 items-center text-base font-semibold leading-5">
                {props.children}
            </div>
        </div>
    );
}

function OptionsFooter() {
    const { dataset, dataset30Days } = useDataset();
    const { t, localeTag } = useI18n();
    const { config } = useUser();
    const { matches } = usePersonal();
    const { team, enemyComp, focus } = createFocusSuggestion();

    const mine = createMemo(() => {
        const current = focus();
        if (!current || team() !== "ally") return [];
        return matches()
            .filter((m) => m.championKey === current.championKey)
            .sort((a, b) => a.timestamp - b.timestamp);
    });
    const form = () => mine().slice(-FORM_GAMES);
    const wins = () => form().filter((m) => m.win).length;
    const duration = () => {
        const seconds = mine()
            .map((m) => m.perf?.duration)
            .filter((d): d is number => d !== undefined && d > 0);
        return seconds.length
            ? seconds.reduce((a, b) => a + b, 0) / seconds.length
            : undefined;
    };
    const lane = () =>
        focus()
            ? getLaneMatchup(focus()!, enemyComp(), dataset30Days())
            : undefined;
    const name = () =>
        focus()
            ? championName(
                  dataset()!.championData[focus()!.championKey],
                  config,
              )
            : "";
    const opponentName = () =>
        lane()
            ? championName(dataset()!.championData[lane()!.opponentKey], config)
            : undefined;

    return (
        <div class="flex shrink-0 border-t border-pg-ln">
            <FooterCard label={t("pro.card.form", { name: name() })}>
                <Show when={form().length > 0} fallback="—">
                    <span
                        role="img"
                        aria-label={t("pro.card.formLabel", {
                            wins: wins(),
                            losses: form().length - wins(),
                        })}
                        class="inline-flex gap-0.5"
                    >
                        <For each={form()}>
                            {(match) => (
                                <b
                                    class={cn(
                                        "h-4 w-2 rounded-[2px] border",
                                        match.win
                                            ? "border-pg-pos bg-pg-pos"
                                            : "border-pg-neg bg-transparent",
                                    )}
                                />
                            )}
                        </For>
                    </span>
                </Show>
            </FooterCard>
            <FooterCard label={t("pro.card.games", { name: name() })}>
                <Show when={mine().length > 0} fallback="—">
                    {t("pro.card.gamesOf", {
                        n: mine().length,
                        total: matches().length,
                    })}
                </Show>
            </FooterCard>
            <FooterCard
                label={
                    opponentName()
                        ? t("pro.card.vs", { name: opponentName()! })
                        : t("pro.card.vsLane")
                }
            >
                <Show when={lane()?.winrate !== undefined} fallback="—">
                    {formatPercent(lane()!.winrate!, 1, localeTag())}
                </Show>
            </FooterCard>
            <FooterCard label={t("pro.card.duration")}>
                <Show when={duration() !== undefined} fallback="—">
                    {formatDuration(duration()!)}
                </Show>
            </FooterCard>
        </div>
    );
}

function OptionsPanel(props: { class?: string }) {
    const { selection } = useDraft();
    const {
        poolFilter,
        setPoolFilter,
        favouriteFilter,
        setFavouriteFilter,
        displayedSuggestions,
    } = useDraftFilters();
    const { t, roleName } = useI18n();
    const { isDesktop } = useMedia();
    const isBanning = () => selection.type === "ban";

    // The one role the rows are for, when they are for a single role.
    const role = () => {
        const roles = new Set(displayedSuggestions().map((s) => s.role));
        return roles.size === 1 ? [...roles][0] : undefined;
    };
    const title = () => {
        if (isBanning()) return t("pro.options.ban");
        const opponent = selection.team === "opponent";
        if (role() === undefined) {
            return opponent
                ? t("pro.options.forOpponent")
                : t("pro.options.any");
        }
        return t(
            opponent ? "pro.options.forOpponentRole" : "pro.options.forRole",
            { role: roleName(role()!) },
        );
    };

    return (
        <ProPanel aria-labelledby="options-title" class={props.class}>
            <ProPanelHead
                title={
                    <>
                        <span id="options-title">{title()}</span>
                        <span class="font-normal text-pg-dim">
                            {" "}
                            · {t("pro.options.hint")}
                        </span>
                    </>
                }
                aside={
                    <Show when={!isBanning()}>
                        <Seg
                            label={t("pro.filter.group")}
                            value={poolFilter()}
                            onChange={setPoolFilter}
                            options={[
                                { value: false, label: t("pro.filter.all") },
                                { value: true, label: t("pro.filter.pool") },
                            ]}
                        />
                    </Show>
                }
            />
            <div class="flex shrink-0 items-center gap-2 border-b border-pg-ln px-3 py-2">
                <Search />
                <TeamSelector />
                <RoleFilter />
                <Show when={!isBanning()}>
                    <button
                        type="button"
                        aria-pressed={favouriteFilter()}
                        aria-label={t("draft.favourite")}
                        class="flex size-7 items-center justify-center rounded-md text-pg-mu hover:text-pg-tx aria-pressed:text-pg-warn focus-visible:outline-2 focus-visible:outline-pg-ac"
                        onClick={() => setFavouriteFilter(!favouriteFilter())}
                    >
                        <Icon path={star} class="size-4" />
                    </button>
                </Show>
                <FilterMenu />
                <Show when={isDesktop}>
                    <AnalyzeHoverToggle />
                </Show>
            </div>
            <Show when={!isBanning()} fallback={<BanTable />}>
                <DraftTable />
                <OptionsFooter />
            </Show>
        </ProPanel>
    );
}

export function SelectionScreen() {
    const { currentDraftView, setCurrentDraftView } = useDraftView();
    const { t } = useI18n();

    return (
        <div class="flex min-h-0 flex-1 flex-col">
            <TeamStrip />
            <Show
                when={currentDraftView().type === "analysis"}
                fallback={
                    <div class="flex min-h-0 flex-1 gap-4 p-4">
                        <CompositionPanel class="hidden w-[280px] shrink-0 min-[1100px]:flex" />
                        <OptionsPanel class="min-w-0 flex-1" />
                        <LanePanel class="hidden w-[320px] shrink-0 min-[1100px]:flex" />
                    </div>
                }
            >
                <div class="flex min-h-0 flex-1 flex-col p-4">
                    <ProPanel class="flex-1">
                        <ProPanelHead
                            title={t("app.tab.analysis")}
                            aside={
                                <ProButton
                                    size="sm"
                                    onClick={() =>
                                        setCurrentDraftView({ type: "draft" })
                                    }
                                >
                                    <Icon path={arrowLeft} class="size-3.5" />
                                    {t("pro.analysis.back")}
                                </ProButton>
                            }
                        />
                        <div class="min-h-0 flex-1 overflow-y-auto bg-pg-bg px-4 py-5 xl:px-8">
                            <AnalysisView />
                        </div>
                    </ProPanel>
                </div>
            </Show>
        </div>
    );
}
