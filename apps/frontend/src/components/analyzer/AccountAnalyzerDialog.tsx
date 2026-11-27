import { For, JSXElement, Show, createMemo } from "solid-js";
import {
    AccountAnalysis,
    Metric,
    PickMetrics,
    TrendDirection,
    TrendKey,
    analyzePersonalMatches,
} from "@draftgap/core/src/personal/analyzer";
import { DialogContent, DialogHeader, DialogTitle } from "../common/Dialog";
import { ChampionLabel } from "../common/ChampionLabel";
import { usePersonal } from "../../contexts/PersonalContext";
import { useDataset } from "../../contexts/DatasetContext";
import { useI18n } from "../../contexts/I18nContext";
import { formatPercentage } from "../../utils/rating";

const pct = (v?: number) =>
    v === undefined ? "-" : `${formatPercentage(v, 1)}%`;
const num = (m: Metric | undefined, decimals = 1) =>
    m === undefined ? "-" : m.value.toFixed(decimals);
const minutes = (m: Metric | undefined) =>
    m === undefined ? "-" : `${Math.round(m.value / 60)} min`;

function Card(props: { label: string; value: string; sub?: string }) {
    return (
        <div class="flex flex-col rounded-md border border-pg-ln bg-pg-s2 px-3 py-2">
            <span class="text-[11px] text-pg-dim">{props.label}</span>
            <span class="text-base font-semibold tabular-nums">
                {props.value}
            </span>
            <Show when={props.sub}>
                <span class="text-xs text-pg-dim">{props.sub}</span>
            </Show>
        </div>
    );
}

function Th(props: { children: JSXElement; class?: string }) {
    return (
        <th class={`px-2 py-1 text-right font-normal ${props.class ?? ""}`}>
            {props.children}
        </th>
    );
}

/** The analyzer body, shared by the dialog and the Cuenta page. */
export function AccountAnalyzerContent(props: { scroll?: boolean }) {
    const { matches } = usePersonal();
    const { dataset } = useDataset();
    const { t, roleName } = useI18n();

    const analysis = createMemo<AccountAnalysis>(() =>
        analyzePersonalMatches(matches(), dataset()),
    );

    const n = (m: Metric | undefined) =>
        m ? t("analyzer.sample", { n: m.sample }) : undefined;

    const kda = (m: PickMetrics) => num(m.kda, 2);
    const kdaAverage = (m: PickMetrics) =>
        m.kills && m.deaths && m.assists
            ? `${num(m.kills)} / ${num(m.deaths)} / ${num(m.assists)}`
            : "-";

    const directionLabel = (d: TrendDirection) => t(`analyzer.trend.${d}`);
    const trendRows: [string, TrendKey, (m: PickMetrics) => string][] = [
        ["analyzer.metric.winrate", "winrate", (m) => pct(m.winrate)],
        ["analyzer.metric.kda", "kda", kda],
        ["analyzer.metric.cs", "csPerMin", (m) => num(m.csPerMin)],
        [
            "analyzer.metric.damage",
            "damagePerMin",
            (m) => num(m.damagePerMin, 0),
        ],
        [
            "analyzer.metric.vision",
            "visionPerMin",
            (m) => num(m.visionPerMin, 2),
        ],
    ];

    const formRow = (label: string, m: PickMetrics) => (
        <tr>
            <td class="px-2 py-1">{label}</td>
            <td class="px-2 py-1 text-right">
                {m.wins}/{m.games} ({pct(m.winrate)})
            </td>
            <td class="px-2 py-1 text-right">
                {kda(m)} <span class="text-xs text-pg-dim">{n(m.kda)}</span>
            </td>
        </tr>
    );

    const streakLabel = () => {
        const current = analysis().streaks.current;
        if (!current) return t("analyzer.streak.none");
        if (current.length === 1) {
            return t(
                current.type === "win"
                    ? "analyzer.streak.winOne"
                    : "analyzer.streak.lossOne",
            );
        }
        return t(
            current.type === "win"
                ? "analyzer.streak.win"
                : "analyzer.streak.loss",
            { n: current.length },
        );
    };

    return (
        <Show
            when={analysis().matchesWithPerf > 0}
            fallback={<span class="text-pg-dim">{t("analyzer.empty")}</span>}
        >
            <div
                class={`flex flex-col gap-4 ${props.scroll ? "max-h-[70vh] overflow-y-auto pr-1" : ""}`}
            >
                <span class="text-xs text-pg-dim">
                    {t("analyzer.partial", {
                        withPerf: analysis().matchesWithPerf,
                        total: analysis().overall.games,
                    })}
                </span>

                <h3 class="border-b border-pg-ln pb-2 text-xs font-semibold text-pg-mu">
                    {t("analyzer.section.summary")}
                </h3>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <Card
                        label={t("analyzer.metric.games")}
                        value={`${analysis().overall.games}`}
                    />
                    <Card
                        label={t("analyzer.metric.winrate")}
                        value={pct(analysis().overall.winrate)}
                    />
                    <Card
                        label={t("analyzer.metric.kda")}
                        value={kda(analysis().overall)}
                        sub={`${kdaAverage(analysis().overall)} ${n(analysis().overall.kda) ?? ""}`}
                    />
                    <Card
                        label={t("analyzer.metric.cs")}
                        value={num(analysis().overall.csPerMin)}
                        sub={n(analysis().overall.csPerMin)}
                    />
                    <Card
                        label={t("analyzer.metric.gold")}
                        value={num(analysis().overall.goldPerMin, 0)}
                        sub={n(analysis().overall.goldPerMin)}
                    />
                    <Card
                        label={t("analyzer.metric.damage")}
                        value={num(analysis().overall.damagePerMin, 0)}
                        sub={n(analysis().overall.damagePerMin)}
                    />
                    <Card
                        label={t("analyzer.metric.vision")}
                        value={num(analysis().overall.visionPerMin, 2)}
                        sub={n(analysis().overall.visionPerMin)}
                    />
                    <Card
                        label={t("analyzer.metric.duration")}
                        value={minutes(analysis().overall.duration)}
                        sub={n(analysis().overall.duration)}
                    />
                </div>

                <h3 class="border-b border-pg-ln pb-2 text-xs font-semibold text-pg-mu">
                    {t("analyzer.section.picks")}
                </h3>
                <table class="w-full text-[13px] tabular-nums">
                    <thead class="text-[11px] font-medium text-pg-dim">
                        <tr>
                            <th class="px-2 py-1 text-left font-normal">
                                {t("pool.col.role")}
                            </th>
                            <th class="px-2 py-1 text-left font-normal">
                                {t("pool.col.champion")}
                            </th>
                            <Th>{t("analyzer.metric.games")}</Th>
                            <Th>{t("analyzer.metric.winrate")}</Th>
                            <Th>{t("analyzer.col.vsAverage")}</Th>
                            <Th>{t("analyzer.metric.kda")}</Th>
                            <Th>{t("analyzer.metric.average")}</Th>
                            <Th>{t("analyzer.metric.cs")}</Th>
                            <Th>{t("analyzer.metric.gold")}</Th>
                            <Th>{t("analyzer.metric.damage")}</Th>
                            <Th>{t("analyzer.metric.vision")}</Th>
                            <Th>{t("analyzer.metric.duration")}</Th>
                        </tr>
                    </thead>
                    <tbody>
                        <For each={analysis().byPick}>
                            {(pick) => (
                                <tr class="border-t border-pg-ln">
                                    <td class="px-2 py-1">
                                        <span class="text-pg-mu">
                                            {roleName(pick.role)}
                                        </span>
                                    </td>
                                    <td class="px-2 py-1">
                                        <Show
                                            when={
                                                dataset()?.championData[
                                                    pick.championKey
                                                ]
                                            }
                                            fallback={pick.championKey}
                                        >
                                            <ChampionLabel
                                                championKey={pick.championKey}
                                            />
                                        </Show>
                                    </td>
                                    <td class="px-2 py-1 text-right">
                                        {pick.metrics.games}
                                    </td>
                                    <td class="px-2 py-1 text-right">
                                        {pct(pick.metrics.winrate)}
                                    </td>
                                    <td class="px-2 py-1 text-right">
                                        <Show
                                            when={pick.comparison}
                                            fallback={t(
                                                "analyzer.compare.none",
                                            )}
                                        >
                                            {(c) => (
                                                <span
                                                    classList={{
                                                        "text-pg-pos":
                                                            c().delta > 0,
                                                        "text-pg-neg":
                                                            c().delta < 0,
                                                    }}
                                                >
                                                    {c().delta > 0 ? "+" : ""}
                                                    {formatPercentage(
                                                        c().delta,
                                                        1,
                                                    )}
                                                    {" ("}
                                                    {pct(c().championWinrate)}
                                                    {")"}
                                                </span>
                                            )}
                                        </Show>
                                    </td>
                                    <td class="px-2 py-1 text-right">
                                        {kda(pick.metrics)}
                                        <div class="text-xs text-pg-dim">
                                            {n(pick.metrics.kda)}
                                        </div>
                                    </td>
                                    <td class="px-2 py-1 text-right">
                                        {kdaAverage(pick.metrics)}
                                    </td>
                                    <td class="px-2 py-1 text-right">
                                        {num(pick.metrics.csPerMin)}
                                        <div class="text-xs text-pg-dim">
                                            {n(pick.metrics.csPerMin)}
                                        </div>
                                    </td>
                                    <td class="px-2 py-1 text-right">
                                        {num(pick.metrics.goldPerMin, 0)}
                                    </td>
                                    <td class="px-2 py-1 text-right">
                                        {num(pick.metrics.damagePerMin, 0)}
                                    </td>
                                    <td class="px-2 py-1 text-right">
                                        {num(pick.metrics.visionPerMin, 2)}
                                    </td>
                                    <td class="px-2 py-1 text-right">
                                        {minutes(pick.metrics.duration)}
                                    </td>
                                </tr>
                            )}
                        </For>
                    </tbody>
                </table>
                <span class="text-xs text-pg-dim">
                    {t("analyzer.compare.note")}
                </span>

                <h3 class="border-b border-pg-ln pb-2 text-xs font-semibold text-pg-mu">
                    {t("analyzer.section.recent")}
                </h3>
                <table class="w-full max-w-md text-[13px] tabular-nums">
                    <tbody>
                        {formRow(
                            t("analyzer.recent.last", { n: 10 }),
                            analysis().recent.last10,
                        )}
                        {formRow(
                            t("analyzer.recent.last", { n: 20 }),
                            analysis().recent.last20,
                        )}
                    </tbody>
                </table>

                <h3 class="border-b border-pg-ln pb-2 text-xs font-semibold text-pg-mu">
                    {t("analyzer.section.trends")}
                </h3>
                <table class="w-full text-[13px] tabular-nums">
                    <thead class="text-[11px] font-medium text-pg-dim">
                        <tr>
                            <th class="px-2 py-1 text-left font-normal" />
                            <For each={analysis().trends.buckets}>
                                {(bucket, i) => (
                                    <Th>
                                        {t("analyzer.trend.block")} {i() + 1}{" "}
                                        <span class="text-xs">
                                            ({bucket.games})
                                        </span>
                                    </Th>
                                )}
                            </For>
                            <Th>{t("analyzer.trend.direction")}</Th>
                        </tr>
                    </thead>
                    <tbody>
                        <For each={trendRows}>
                            {([label, key, format]) => (
                                <tr class="border-t border-pg-ln">
                                    <td class="px-2 py-1">{t(label as any)}</td>
                                    <For each={analysis().trends.buckets}>
                                        {(bucket) => (
                                            <td class="px-2 py-1 text-right">
                                                {format(bucket)}
                                            </td>
                                        )}
                                    </For>
                                    <td class="px-2 py-1 text-right">
                                        {directionLabel(
                                            analysis().trends.direction[key],
                                        )}
                                    </td>
                                </tr>
                            )}
                        </For>
                    </tbody>
                </table>

                <h3 class="border-b border-pg-ln pb-2 text-xs font-semibold text-pg-mu">
                    {t("analyzer.section.streaks")}
                </h3>
                <div class="flex flex-wrap gap-2">
                    <Card
                        label={t("analyzer.streak.current")}
                        value={streakLabel()}
                    />
                    <div class="flex flex-col justify-center text-[13px]">
                        <span>
                            {t("analyzer.streak.longestWin", {
                                n: analysis().streaks.longestWin,
                            })}
                        </span>
                        <span>
                            {t("analyzer.streak.longestLoss", {
                                n: analysis().streaks.longestLoss,
                            })}
                        </span>
                    </div>
                </div>
            </div>
        </Show>
    );
}

export function AccountAnalyzerDialog() {
    const { t } = useI18n();

    return (
        <DialogContent class="max-w-5xl">
            <DialogHeader>
                <DialogTitle>{t("analyzer.title")}</DialogTitle>
            </DialogHeader>
            <AccountAnalyzerContent scroll />
        </DialogContent>
    );
}
