import { For, JSX, Show } from "solid-js";
import { ratingToWinrate } from "@draftgap/core/src/rating/ratings";
import { useDraftAnalysis } from "../../contexts/DraftAnalysisContext";
import { useExtraDraftAnalysis } from "../../contexts/ExtraDraftAnalysisContext";
import { useDraftView } from "../../contexts/DraftViewContext";
import { useI18n } from "../../contexts/I18nContext";
import {
    formatNumber,
    formatPercent,
    formatSigned,
    signClass,
} from "../../utils/format";
import { cn } from "../../utils/style";
import { ProBar, ProButton, ProPanel, ProPanelHead } from "../common/Pro";

type Damage = { physical: number; magic: number; true: number };

const share = (damage: Damage | undefined, kind: keyof Damage) => {
    if (!damage) return undefined;
    const total = damage.physical + damage.magic + damage.true;
    return total > 0 ? damage[kind] / total : undefined;
};

function Pair(props: { children: JSX.Element; second: JSX.Element }) {
    return (
        <span class="font-semibold tabular-nums">
            {props.children} <span class="font-normal text-pg-dim">·</span>{" "}
            {props.second}
        </span>
    );
}

function Line(props: { label: string; children: JSX.Element }) {
    return (
        <div class="flex h-8 items-center justify-between border-b border-pg-ln">
            <span class="text-pg-mu">{props.label}</span>
            {props.children}
        </div>
    );
}

export function CompositionPanel(props: { class?: string }) {
    const {
        allyDraftAnalysis,
        opponentDraftAnalysis,
        allyDamageDistribution,
        opponentDamageDistribution,
        allyTeamComp,
        opponentTeamComp,
    } = useDraftAnalysis();
    const { allyDraftExtraAnalysis, opponentDraftExtraAnalysis } =
        useExtraDraftAnalysis();
    const { setCurrentDraftView } = useDraftView();
    const { t, localeTag } = useI18n();

    const hasPicks = () => allyTeamComp().size + opponentTeamComp().size > 0;

    const winrate = (rating: number | undefined) =>
        rating === undefined
            ? "—"
            : formatPercent(ratingToWinrate(rating), 1, localeTag());

    /** A rating over expectation, as winrate points. */
    const points = (rating: number | undefined) =>
        rating === undefined
            ? undefined
            : (ratingToWinrate(rating) - 0.5) * 100;
    const Points = (p: { rating: number | undefined }) => (
        <span class={signClass(points(p.rating))}>
            {points(p.rating) === undefined
                ? "—"
                : formatSigned(points(p.rating)!, 1, localeTag())}
        </span>
    );

    const timeRows = [
        { index: 0, label: "pro.comp.early" },
        { index: 2, label: "pro.comp.mid" },
        { index: 4, label: "pro.comp.late" },
    ] as const;

    const damageRows = () =>
        (
            [
                ["pro.comp.ad", "physical"],
                ["pro.comp.ap", "magic"],
                ["pro.comp.true", "true"],
            ] as const
        )
            .map(([label, kind]) => ({
                label,
                ally: share(allyDamageDistribution(), kind),
                opponent: share(opponentDamageDistribution(), kind),
            }))
            // True damage only shows when a team deals a visible amount.
            .filter(
                (row) =>
                    row.label !== "pro.comp.true" ||
                    (row.ally ?? 0) >= 0.005 ||
                    (row.opponent ?? 0) >= 0.005,
            );

    const percent = (value: number | undefined) =>
        value === undefined
            ? "—"
            : `${formatNumber(value * 100, 0, localeTag())} %`;

    return (
        <ProPanel aria-labelledby="comp-title" class={props.class}>
            <ProPanelHead
                title={<span id="comp-title">{t("pro.comp.title")}</span>}
                aside={t("pro.comp.sides")}
            />
            <div class="min-h-0 flex-1 overflow-y-auto px-4 py-2">
                <Show
                    when={hasPicks()}
                    fallback={
                        <p class="py-4 text-pg-dim">{t("pro.comp.empty")}</p>
                    }
                >
                    <Line label={t("pro.comp.winrate")}>
                        <Pair
                            second={winrate(
                                opponentDraftAnalysis()?.totalRating,
                            )}
                        >
                            {winrate(allyDraftAnalysis()?.totalRating)}
                        </Pair>
                    </Line>
                    <For each={timeRows}>
                        {(row) => (
                            <Line label={t(row.label)}>
                                <Pair
                                    second={winrate(
                                        opponentDraftExtraAnalysis()
                                            ?.ratingByTime[row.index]
                                            ?.totalRating,
                                    )}
                                >
                                    {winrate(
                                        allyDraftExtraAnalysis()?.ratingByTime[
                                            row.index
                                        ]?.totalRating,
                                    )}
                                </Pair>
                            </Line>
                        )}
                    </For>
                    <Line label={t("pro.comp.champions")}>
                        <Pair
                            second={
                                <Points
                                    rating={
                                        opponentDraftAnalysis()
                                            ?.allyChampionRating.totalRating
                                    }
                                />
                            }
                        >
                            <Points
                                rating={
                                    allyDraftAnalysis()?.allyChampionRating
                                        .totalRating
                                }
                            />
                        </Pair>
                    </Line>
                    <Line label={t("pro.comp.duos")}>
                        <Pair
                            second={
                                <Points
                                    rating={
                                        opponentDraftAnalysis()?.allyDuoRating
                                            .totalRating
                                    }
                                />
                            }
                        >
                            <Points
                                rating={
                                    allyDraftAnalysis()?.allyDuoRating
                                        .totalRating
                                }
                            />
                        </Pair>
                    </Line>
                    <Line label={t("pro.comp.matchups")}>
                        <Pair
                            second={
                                <Points
                                    rating={
                                        opponentDraftAnalysis()?.matchupRating
                                            .totalRating
                                    }
                                />
                            }
                        >
                            <Points
                                rating={
                                    allyDraftAnalysis()?.matchupRating
                                        .totalRating
                                }
                            />
                        </Pair>
                    </Line>
                    <For each={damageRows()}>
                        {(row) => (
                            <div class="pt-3">
                                <div class="mb-1 flex justify-between">
                                    <span class="text-pg-mu">
                                        {t(row.label)}
                                    </span>
                                    <Pair second={percent(row.opponent)}>
                                        {percent(row.ally)}
                                    </Pair>
                                </div>
                                <ProBar
                                    trackClass="bg-pg-red-ln"
                                    value={
                                        row.ally === undefined ||
                                        row.opponent === undefined ||
                                        row.ally + row.opponent === 0
                                            ? 0.5
                                            : row.ally /
                                              (row.ally + row.opponent)
                                    }
                                />
                            </div>
                        )}
                    </For>
                </Show>
            </div>
            <div class={cn("shrink-0 border-t border-pg-ln p-3")}>
                <ProButton
                    class="w-full"
                    onClick={() => setCurrentDraftView({ type: "analysis" })}
                >
                    {t("app.tab.analysis")}
                </ProButton>
            </div>
        </ProPanel>
    );
}
