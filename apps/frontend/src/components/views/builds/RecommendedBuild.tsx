import { For, Show, createMemo } from "solid-js";
import { useI18n } from "../../../contexts/I18nContext";
import { useBuild } from "../../../contexts/BuildContext";
import { useDataset } from "../../../contexts/DatasetContext";
import { useUser } from "../../../contexts/UserContext";
import { usePersonal } from "../../../contexts/PersonalContext";
import { computeMetrics } from "@draftgap/core/src/personal/analyzer";
import {
    BuildChoice,
    BuildSlot,
    RecommendedRunes,
} from "@draftgap/core/src/builds/recommended-build";
import { SkillOrder } from "@draftgap/core/src/models/build/BuildDataset";
import { Role } from "@draftgap/core/src/models/Role";
import { ratingToWinrate } from "@draftgap/core/src/rating/ratings";
import { itemName, runePathName, summonerSpellName } from "../../../utils/i18n";
import { ProPanel, ProPanelHead } from "../../common/Pro";
import { Rune } from "./RuneTable";

const shardTypes = ["offense", "flex", "defense"] as const;
const skillKeys = ["Q", "W", "E", "R"] as const;

function useBuildNumbers() {
    const { localeTag } = useI18n();
    return {
        percent: (n: number) =>
            n.toLocaleString(localeTag(), {
                style: "percent",
                maximumFractionDigits: 2,
            }),
        number: (n: number) =>
            n.toLocaleString(localeTag(), { maximumFractionDigits: 2 }),
    };
}

export function RecommendedBuild() {
    const { t } = useI18n();
    const { recommendedBuild } = useBuild();
    const build = () => {
        const result = recommendedBuild();
        return result?.available ? result.build : undefined;
    };

    return (
        <Show
            when={build()}
            fallback={
                <ProPanel class="p-4 text-pg-mu">
                    {t("build.recommended.empty")}
                </ProPanel>
            }
        >
            {(b) => (
                <div class="grid gap-4 min-[1120px]:grid-cols-[minmax(0,30fr)_minmax(0,38fr)_minmax(0,30fr)]">
                    <ProPanel class="min-w-0">
                        <ProPanelHead title={t("build.runes")} />
                        <Show
                            when={b().runes}
                            fallback={
                                <p class="p-4 text-pg-mu">
                                    {t("build.recommended.empty")}
                                </p>
                            }
                        >
                            {(runes) => <RuneTrees runes={runes()} />}
                        </Show>
                    </ProPanel>
                    <ProPanel class="min-w-0">
                        <ProPanelHead title={t("build.pro.buyOrder")} />
                        <div class="grid grid-cols-[2.25rem_minmax(0,1fr)_4.5rem_5.5rem] gap-2 border-b border-pg-ln px-3 py-2 text-[11px] text-pg-dim">
                            <span />
                            <span>{t("build.items")}</span>
                            <span class="text-right">
                                {t("pool.col.winrate")} · {t("pool.col.games")}
                            </span>
                            <span class="text-right">
                                {t("build.recommended.alternatives")}
                            </span>
                        </div>
                        <div class="divide-y divide-pg-ln">
                            <Show when={b().startingItems}>
                                {(slot) => (
                                    <ItemRow
                                        label={t("build.pro.start")}
                                        choice={slot().choice}
                                        alternatives={slot().alternatives}
                                    />
                                )}
                            </Show>
                            <Show when={b().boots}>
                                {(slot) => (
                                    <SingleItemRow
                                        label={t("build.boots")}
                                        slot={slot()}
                                    />
                                )}
                            </Show>
                            <For each={b().coreItems}>
                                {(slot, i) => (
                                    <SingleItemRow
                                        label={String(i() + 1)}
                                        slot={slot}
                                    />
                                )}
                            </For>
                        </div>
                        <SituationalItems />
                    </ProPanel>
                    <div class="flex min-w-0 flex-col gap-4">
                        <Show when={b().skillOrder}>
                            {(slot) => <SkillGrid slot={slot()} />}
                        </Show>
                        <Show when={b().summonerSpells}>
                            {(slot) => (
                                <ProPanel>
                                    <ProPanelHead
                                        title={t("build.summonerSpells")}
                                    />
                                    <div class="grid gap-3 p-4">
                                        <SpellRow choice={slot().choice} />
                                        <For each={slot().alternatives}>
                                            {(choice) => (
                                                <SpellRow
                                                    choice={choice}
                                                    alternative
                                                />
                                            )}
                                        </For>
                                    </div>
                                </ProPanel>
                            )}
                        </Show>
                        <PersonalRecord
                            championKey={b().championKey}
                            role={b().role}
                        />
                    </div>
                </div>
            )}
        </Show>
    );
}

function RuneTrees(props: { runes: RecommendedRunes }) {
    const { t } = useI18n();
    const { dataset } = useDataset();
    const { config } = useUser();
    const { partialBuildDataset, buildAnalysisResult } = useBuild();
    const { number, percent } = useBuildNumbers();
    const pathName = (id: number) =>
        runePathName(dataset()!.runePathData[id], config);

    function RuneOption(p: {
        id: number;
        type: "primary" | "secondary" | `shard-${(typeof shardTypes)[number]}`;
        selected: boolean;
    }) {
        const shard = () =>
            shardTypes.find((type) => p.type === `shard-${type}`);
        const stats = () => {
            const runes = partialBuildDataset()?.runes;
            const type = p.type;
            return type === "primary" || type === "secondary"
                ? runes?.[type]?.[p.id]
                : runes?.shards[shard()!]?.[p.id];
        };
        const rating = () => {
            const runes = buildAnalysisResult()?.runes;
            const type = p.type;
            return (
                (type === "primary" || type === "secondary"
                    ? runes?.[type][p.id]
                    : runes?.shards[shard()!]?.[p.id]
                )?.totalRating ?? 0
            );
        };
        return (
            <Rune
                runeId={p.id}
                type={p.type}
                games={stats()?.games ?? 0}
                rating={rating()}
                totalGames={partialBuildDataset()?.games ?? 0}
                pro={{
                    recommended: p.selected,
                    stats: stats()?.games
                        ? percent(ratingToWinrate(rating()))
                        : "—",
                    games: number(stats()?.games ?? 0),
                }}
            />
        );
    }

    function Tree(p: { path: number; type: "primary" | "secondary" }) {
        const runes = createMemo(() =>
            Object.values(dataset()!.runeData)
                .filter((r) => r.pathId === p.path)
                .sort((a, b) => a.index - b.index),
        );
        return (
            <>
                <h3
                    class="mb-2 text-xs font-semibold"
                    title={t(`build.recommended.${p.type}Path`, {
                        path: pathName(p.path),
                    })}
                >
                    {pathName(p.path)}
                </h3>
                <div class="grid gap-3">
                    <For each={p.type === "primary" ? [0, 1, 2, 3] : [1, 2, 3]}>
                        {(row) => (
                            <div class="flex gap-1">
                                <For
                                    each={runes().filter((r) => r.slot === row)}
                                >
                                    {(rune) => (
                                        <RuneOption
                                            id={rune.id}
                                            type={p.type}
                                            selected={props.runes[p.type].some(
                                                (slot) =>
                                                    slot.choice.value ===
                                                    rune.id,
                                            )}
                                        />
                                    )}
                                </For>
                            </div>
                        )}
                    </For>
                </div>
            </>
        );
    }

    return (
        <>
            <p class="border-b border-pg-ln px-4 py-2 text-xs text-pg-mu">
                {t("build.pro.runeStats")}
            </p>
            <div class="grid grid-cols-2 gap-3 p-4">
                <div class="min-w-0">
                    <Tree path={props.runes.primaryPathId} type="primary" />
                </div>
                <div class="min-w-0">
                    <Tree path={props.runes.secondaryPathId} type="secondary" />
                    <h3 class="mt-4 mb-2 text-xs font-semibold">
                        {t("build.shards")}
                    </h3>
                    <div class="grid gap-3">
                        <For each={shardTypes}>
                            {(type, row) => {
                                const options = () =>
                                    Object.values(dataset()!.statShardData)
                                        .flatMap((shard) =>
                                            shard.positions
                                                .filter((p) => p.slot === row())
                                                .map((p) => ({
                                                    id: shard.id,
                                                    index: p.index,
                                                })),
                                        )
                                        .sort((a, b) => a.index - b.index);
                                return (
                                    <div class="flex gap-1">
                                        <For each={options()}>
                                            {(option) => (
                                                <RuneOption
                                                    id={option.id}
                                                    type={`shard-${type}`}
                                                    selected={
                                                        props.runes.shards[
                                                            row()
                                                        ]?.choice.value ===
                                                        option.id
                                                    }
                                                />
                                            )}
                                        </For>
                                    </div>
                                );
                            }}
                        </For>
                    </div>
                </div>
            </div>
        </>
    );
}

function SituationalItems() {
    const { t } = useI18n();
    const { percent } = useBuildNumbers();
    const { situational } = useBuild();
    const recommendedKind = () => {
        const { focus } = situational();
        return focus === "magic"
            ? "magicResist"
            : focus === "physical"
              ? "armor"
              : undefined;
    };
    const kinds = createMemo(() => {
        const order =
            recommendedKind() === "magicResist"
                ? (["magicResist", "armor"] as const)
                : (["armor", "magicResist"] as const);
        return order.filter((kind) => situational()[kind].length > 0);
    });
    const reason = () => {
        const { focus, magicShare } = situational();
        if (
            focus === "unknown" ||
            focus === "mixed" ||
            magicShare === undefined
        ) {
            return t(
                focus === "mixed"
                    ? "build.situational.mixed"
                    : "build.situational.unknown",
            );
        }
        return t(`build.situational.${focus}`, {
            share: percent(focus === "magic" ? magicShare : 1 - magicShare),
        });
    };

    return (
        <Show when={kinds().length > 0}>
            <section class="border-t border-pg-ln px-3 py-3">
                <h3 class="text-sm font-semibold text-pg-tx">
                    {t("build.situational.title")}
                </h3>
                <p class="text-xs text-pg-mu">{reason()}</p>
                <div class="divide-y divide-pg-ln">
                    <For each={kinds()}>
                        {(kind) => (
                            <div class="space-y-2 py-2">
                                <h4 class="flex flex-wrap items-baseline gap-x-2 text-xs font-semibold text-pg-tx">
                                    {t(`build.import.block.${kind}`)}
                                    <Show when={kind === recommendedKind()}>
                                        <span class="text-pg-pos">
                                            {t("build.situational.recommended")}
                                        </span>
                                    </Show>
                                </h4>
                                <For each={situational()[kind]}>
                                    {(choice) => (
                                        <div class="grid grid-cols-[minmax(0,1fr)_5.5rem] items-center gap-2 break-words">
                                            <ItemIcons
                                                ids={[choice.value]}
                                                names
                                            />
                                            <span class="text-right">
                                                <ChoiceStats
                                                    choice={{
                                                        games: choice.games,
                                                        winrate:
                                                            choice.rawWinrate,
                                                        lowConfidence: false,
                                                    }}
                                                />
                                            </span>
                                        </div>
                                    )}
                                </For>
                            </div>
                        )}
                    </For>
                </div>
            </section>
        </Show>
    );
}

function ChoiceStats(props: {
    choice: Pick<BuildChoice<unknown>, "games" | "winrate" | "lowConfidence">;
}) {
    const { t } = useI18n();
    const { number, percent } = useBuildNumbers();
    return (
        <span class="text-xs text-pg-mu">
            <strong class="text-pg-tx">{percent(props.choice.winrate)}</strong>{" "}
            ·{" "}
            {t("build.recommended.games", {
                games: number(props.choice.games),
            })}
            <Show when={props.choice.lowConfidence}>
                {" "}
                · {t("build.recommended.lowConfidence")}
            </Show>
        </span>
    );
}

function SingleItemRow(props: { label: string; slot: BuildSlot<number> }) {
    const pack = (choice: BuildChoice<number>) => ({
        ...choice,
        value: [choice.value],
    });
    return (
        <ItemRow
            label={props.label}
            choice={pack(props.slot.choice)}
            alternatives={props.slot.alternatives.map(pack)}
        />
    );
}

function ItemRow(props: {
    label: string;
    choice: BuildChoice<number[]>;
    alternatives: BuildChoice<number[]>[];
}) {
    return (
        <div class="grid min-h-[68px] grid-cols-[2.25rem_minmax(0,1fr)_4.5rem_5.5rem] items-center gap-2 px-3 py-2">
            <span class="break-words text-xs text-pg-mu">{props.label}</span>
            <ItemIcons ids={props.choice.value} names />
            <span class="text-right">
                <ChoiceStats choice={props.choice} />
            </span>
            <div class="flex flex-wrap justify-end gap-1">
                <For each={props.alternatives}>
                    {(choice) => <ItemAlternative choice={choice} />}
                </For>
            </div>
        </div>
    );
}

function ItemAlternative(props: { choice: BuildChoice<number[]> }) {
    const { t } = useI18n();
    const { number, percent } = useBuildNumbers();
    return (
        <ItemIcons
            ids={props.choice.value}
            stats={`${percent(props.choice.winrate)} · ${t("build.recommended.games", { games: number(props.choice.games) })}`}
        />
    );
}

function ItemIcons(props: { ids: number[]; names?: boolean; stats?: string }) {
    const { dataset } = useDataset();
    const { config } = useUser();
    const name = (id: number) =>
        dataset()!.itemData[id]
            ? itemName(dataset()!.itemData[id], config)
            : String(id);
    return (
        <span
            class="flex min-w-0 flex-wrap items-center gap-1.5"
            title={
                props.stats
                    ? `${props.ids.map(name).join(" + ")} · ${props.stats}`
                    : undefined
            }
        >
            <For each={props.ids}>
                {(id) => (
                    <img
                        src={`https://ddragon.leagueoflegends.com/cdn/${dataset()!.version}/img/item/${id}.png`}
                        alt={props.names ? "" : name(id)}
                        class="rounded border border-pg-ln2"
                        classList={{
                            "size-9": !!props.names,
                            "size-7 opacity-75": !props.names,
                        }}
                    />
                )}
            </For>
            <Show when={props.names}>
                <strong>{props.ids.map(name).join(" + ")}</strong>
            </Show>
        </span>
    );
}

function SpellRow(props: {
    choice: BuildChoice<number[]>;
    alternative?: boolean;
}) {
    const { dataset } = useDataset();
    const { config } = useUser();
    const spell = (id: number) => dataset()!.summonerSpellData[id];
    return (
        <div class="flex items-center gap-2">
            <For each={props.choice.value}>
                {(id) => (
                    <Show when={spell(id)}>
                        {(s) => (
                            <img
                                src={`https://ddragon.leagueoflegends.com/cdn/${dataset()!.version}/img/spell/${s().id}.png`}
                                alt=""
                                class="size-9 rounded border border-pg-ln2"
                                classList={{ "opacity-75": props.alternative }}
                            />
                        )}
                    </Show>
                )}
            </For>
            <div class="ml-1">
                <div class="font-semibold">
                    {props.choice.value
                        .map((id) =>
                            spell(id)
                                ? summonerSpellName(spell(id), config)
                                : id,
                        )
                        .join(" + ")}
                </div>
                <ChoiceStats choice={props.choice} />
            </div>
        </div>
    );
}

function SkillGrid(props: { slot: BuildSlot<SkillOrder> }) {
    const { t } = useI18n();
    const { partialBuildDataset } = useBuild();
    const { number } = useBuildNumbers();
    const levels = () => partialBuildDataset()?.skills.level ?? [];
    const priority = (order: SkillOrder) => order.split("").join(" › ");
    return (
        <ProPanel>
            <ProPanelHead
                title={t("build.skillOrder")}
                aside={
                    <strong class="text-pg-tx">
                        {priority(props.slot.choice.value)}
                    </strong>
                }
            />
            <div class="overflow-x-auto px-4 py-3">
                <table class="w-full border-separate border-spacing-0.5 text-center text-[11px]">
                    <caption class="mb-2 text-left text-pg-mu">
                        {t("build.pro.skillLevels")}
                    </caption>
                    <thead>
                        <tr>
                            <th scope="col">{t("build.level")}</th>
                            <For each={levels()}>
                                {(_, i) => <th scope="col">{i() + 1}</th>}
                            </For>
                        </tr>
                    </thead>
                    <tbody>
                        <For each={skillKeys}>
                            {(skill) => (
                                <tr>
                                    <th
                                        scope="row"
                                        class="rounded bg-pg-s2 px-1"
                                    >
                                        {skill}
                                    </th>
                                    <For each={levels()}>
                                        {(level, i) => {
                                            const games = () =>
                                                level[skill]?.games ?? 0;
                                            const mostPlayed = () =>
                                                games() > 0 &&
                                                skillKeys.every(
                                                    (s) =>
                                                        games() >=
                                                        (level[s]?.games ?? 0),
                                                );
                                            return (
                                                <td
                                                    class="rounded px-0.5"
                                                    classList={{
                                                        "bg-pg-ac text-pg-ac-ink":
                                                            mostPlayed(),
                                                        "bg-pg-s3 text-pg-mu":
                                                            !mostPlayed(),
                                                    }}
                                                    title={t(
                                                        "build.recommended.games",
                                                        {
                                                            games: number(
                                                                games(),
                                                            ),
                                                        },
                                                    )}
                                                >
                                                    {mostPlayed()
                                                        ? i() + 1
                                                        : "·"}
                                                </td>
                                            );
                                        }}
                                    </For>
                                </tr>
                            )}
                        </For>
                    </tbody>
                </table>
            </div>
            <div class="grid gap-1 border-t border-pg-ln px-4 py-2">
                <For each={[props.slot.choice, ...props.slot.alternatives]}>
                    {(choice) => (
                        <div class="flex justify-between gap-2">
                            <span>{priority(choice.value)}</span>
                            <ChoiceStats choice={choice} />
                        </div>
                    )}
                </For>
            </div>
        </ProPanel>
    );
}

function PersonalRecord(props: { championKey: string; role: Role }) {
    const { t } = useI18n();
    const { matches } = usePersonal();
    const { number } = useBuildNumbers();
    const metrics = createMemo(() =>
        computeMetrics(
            matches().filter(
                (match) =>
                    match.championKey === props.championKey &&
                    match.role === props.role,
            ),
        ),
    );
    return (
        <Show when={metrics().games > 0}>
            <ProPanel>
                <ProPanelHead
                    title={t("build.pro.history")}
                    aside={t("build.recommended.games", {
                        games: number(metrics().games),
                    })}
                />
                <dl class="grid grid-cols-3 divide-x divide-pg-ln">
                    <For
                        each={[
                            {
                                label: t("build.pro.record"),
                                value: `${number(metrics().wins)}–${number(metrics().games - metrics().wins)}`,
                            },
                            {
                                label: t("analyzer.metric.kda"),
                                value: metrics().kda
                                    ? number(metrics().kda!.value)
                                    : "—",
                            },
                            {
                                label: t("analyzer.metric.cs"),
                                value: metrics().csPerMin
                                    ? number(metrics().csPerMin!.value)
                                    : "—",
                            },
                        ]}
                    >
                        {(entry) => (
                            <div class="p-3">
                                <dt class="text-[11px] text-pg-dim">
                                    {entry.label}
                                </dt>
                                <dd class="text-base font-semibold">
                                    {entry.value}
                                </dd>
                            </div>
                        )}
                    </For>
                </dl>
            </ProPanel>
        </Show>
    );
}
