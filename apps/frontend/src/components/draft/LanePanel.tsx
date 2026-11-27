import { For, JSX, Show, createMemo } from "solid-js";
import { format } from "date-fns";
import { useDraftFilters } from "../../contexts/DraftFiltersContext";
import { useDataset } from "../../contexts/DatasetContext";
import { useI18n } from "../../contexts/I18nContext";
import { useUser } from "../../contexts/UserContext";
import { usePersonal } from "../../contexts/PersonalContext";
import { useMedia } from "../../hooks/useMedia";
import { useOpenBuild } from "../../hooks/useOpenBuild";
import { createFocusSuggestion } from "../../hooks/createFocusSuggestion";
import { championName } from "../../utils/i18n";
import { getLaneMatchup } from "../../utils/lane-matchup";
import { formatPercent, formatSigned, signClass } from "../../utils/format";
import { cn } from "../../utils/style";
import { ChampionIcon } from "../icons/ChampionIcon";
import { Dialog, DialogTrigger } from "../common/Dialog";
import { ExplainDialog } from "../dialogs/ExplainDialog";
import { DraftMatchupChat } from "../match/MatchupChatPanel";
import { ProButton, ProPanel, ProPanelHead } from "../common/Pro";

function Portrait(props: { championKey: string | undefined; red?: boolean }) {
    return (
        <span
            class={cn(
                "flex size-14 items-center justify-center overflow-hidden rounded border bg-[repeating-linear-gradient(135deg,#1b2028_0_6px,#171b21_6px_12px)]",
                props.red
                    ? "border-pg-red-ln"
                    : "border-pg-ac shadow-[0_0_0_1px_var(--color-pg-ac)]",
            )}
        >
            <Show
                when={props.championKey}
                fallback={<span class="text-pg-dim">?</span>}
            >
                <ChampionIcon
                    championKey={props.championKey!}
                    size={54}
                    class="rounded-none"
                />
            </Show>
        </span>
    );
}

function Stat(props: { label: string; children: JSX.Element }) {
    return (
        <div class="flex h-8 items-center justify-between border-b border-pg-ln">
            <dt class="text-pg-mu">{props.label}</dt>
            <dd class="font-semibold tabular-nums">{props.children}</dd>
        </div>
    );
}

function ExplainSuggestionsButton() {
    const { displayedSuggestions } = useDraftFilters();
    const { t } = useI18n();
    return (
        <Dialog>
            <DialogTrigger
                as={ProButton}
                size="lg"
                class="justify-start font-normal text-pg-mu"
            >
                {t("draft.explain")}
            </DialogTrigger>
            <ExplainDialog suggestions={displayedSuggestions()} />
        </Dialog>
    );
}

export function LanePanel(props: { class?: string }) {
    const { dataset, dataset30Days } = useDataset();
    const { t, roleName, localeTag, dateLocale } = useI18n();
    const { config } = useUser();
    const { matches } = usePersonal();
    const { isDesktop } = useMedia();
    const openBuild = useOpenBuild();

    const { team, enemyComp, focus } = createFocusSuggestion();

    const matchup = () =>
        focus()
            ? getLaneMatchup(focus()!, enemyComp(), dataset30Days())
            : undefined;

    const nameOf = (key: string) =>
        championName(dataset()!.championData[key], config);

    const latest = createMemo(() => {
        const current = focus();
        if (!current || team() !== "ally") return [];
        return [...matches()]
            .filter((m) => m.championKey === current.championKey)
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, 3);
    });

    const kda = (perf: {
        kills?: number;
        deaths?: number;
        assists?: number;
    }) =>
        perf.kills === undefined ||
        perf.deaths === undefined ||
        perf.assists === undefined
            ? "—"
            : `${perf.kills}/${perf.deaths}/${perf.assists}`;

    return (
        <ProPanel aria-labelledby="lane-title" class={props.class}>
            <ProPanelHead
                title={<span id="lane-title">{t("pro.lane.title")}</span>}
                aside={focus() ? roleName(focus()!.role) : undefined}
            />
            <div class="min-h-0 flex-1 overflow-y-auto">
                <Show
                    when={focus()}
                    fallback={
                        <div class="flex flex-col gap-2 p-4">
                            <p class="text-pg-dim">
                                {t("pro.lane.noChampion")}
                            </p>
                            <Show when={team() === "ally"}>
                                <ExplainSuggestionsButton />
                            </Show>
                        </div>
                    }
                >
                    {(current) => (
                        <div class="flex flex-col gap-4 p-4">
                            <div class="flex items-center justify-between">
                                <Portrait championKey={current().championKey} />
                                <span class="text-pg-dim">
                                    {t("pro.lane.vs")}
                                </span>
                                <Portrait
                                    championKey={matchup()?.opponentKey}
                                    red
                                />
                            </div>
                            <Show
                                when={matchup()}
                                fallback={
                                    <p class="text-pg-dim">
                                        {t("pro.lane.noOpponent")}
                                    </p>
                                }
                            >
                                {(lane) => (
                                    <dl>
                                        <Show
                                            when={lane().winrate !== undefined}
                                        >
                                            <Stat label={t("pro.lane.wr")}>
                                                {formatPercent(
                                                    lane().winrate!,
                                                    1,
                                                    localeTag(),
                                                )}
                                            </Stat>
                                        </Show>
                                        <Show when={lane().delta !== undefined}>
                                            <Stat label={t("pro.lane.delta")}>
                                                <span
                                                    class={signClass(
                                                        lane().delta,
                                                    )}
                                                >
                                                    {formatSigned(
                                                        lane().delta!,
                                                        1,
                                                        localeTag(),
                                                    )}
                                                </span>
                                            </Stat>
                                        </Show>
                                    </dl>
                                )}
                            </Show>
                            <div class="flex flex-col gap-2">
                                <ProButton
                                    variant="primary"
                                    size="lg"
                                    onClick={() =>
                                        openBuild(
                                            current().championKey,
                                            current().role,
                                        )
                                    }
                                >
                                    {t("pro.buildOf", {
                                        name: nameOf(current().championKey),
                                    })}
                                </ProButton>
                                <Show when={team() === "ally"}>
                                    <ExplainSuggestionsButton />
                                </Show>
                                <Show
                                    when={
                                        isDesktop &&
                                        team() === "ally" &&
                                        matchup()?.opponentKey
                                    }
                                >
                                    <Dialog>
                                        <DialogTrigger
                                            as={ProButton}
                                            size="lg"
                                            class="justify-start font-normal text-pg-mu"
                                        >
                                            {t("pro.lane.ask")}
                                        </DialogTrigger>
                                        <DraftMatchupChat
                                            me={{
                                                championKey:
                                                    current().championKey,
                                                role: current().role,
                                            }}
                                            opponent={{
                                                championKey:
                                                    matchup()!.opponentKey,
                                                role: current().role,
                                            }}
                                        />
                                    </Dialog>
                                </Show>
                            </div>
                            <Show when={team() === "ally"}>
                                <div>
                                    <h3 class="flex h-8 items-center border-b border-pg-ln text-xs font-semibold text-pg-mu">
                                        {t("pro.lane.latest", {
                                            name: nameOf(current().championKey),
                                        })}
                                    </h3>
                                    <Show
                                        when={latest().length > 0}
                                        fallback={
                                            <p class="py-2 text-pg-dim">
                                                {t("pro.lane.noGames", {
                                                    name: nameOf(
                                                        current().championKey,
                                                    ),
                                                })}
                                            </p>
                                        }
                                    >
                                        <For each={latest()}>
                                            {(match) => (
                                                <div class="flex h-8 items-center justify-between border-b border-pg-ln">
                                                    <span class="text-pg-mu">
                                                        {format(
                                                            new Date(
                                                                match.timestamp,
                                                            ),
                                                            "d MMM",
                                                            {
                                                                locale: dateLocale(),
                                                            },
                                                        )}
                                                    </span>
                                                    <span
                                                        class={cn(
                                                            "font-semibold",
                                                            match.win
                                                                ? "text-pg-pos"
                                                                : "text-pg-neg",
                                                        )}
                                                    >
                                                        {match.win
                                                            ? t("pro.win")
                                                            : t("pro.loss")}
                                                    </span>
                                                    <span class="text-pg-mu tabular-nums">
                                                        {match.perf
                                                            ? kda(match.perf)
                                                            : "—"}
                                                    </span>
                                                </div>
                                            )}
                                        </For>
                                    </Show>
                                </div>
                            </Show>
                        </div>
                    )}
                </Show>
            </div>
        </ProPanel>
    );
}
