import { Component, For, JSX, Show } from "solid-js";
import { Panel, PanelHeader } from "../../common/Panel";
import { useI18n } from "../../../contexts/I18nContext";
import { useBuild } from "../../../contexts/BuildContext";
import { useDataset } from "../../../contexts/DatasetContext";
import { useUser } from "../../../contexts/UserContext";
import {
    BuildChoice,
    BuildSlot,
    RecommendedRunes,
} from "@draftgap/core/src/builds/recommended-build";
import { ImportToClientButton } from "./ImportToClientButton";
import { formatPercentage } from "../../../utils/rating";
import {
    itemName,
    runeName,
    runePathName,
    statShardName,
    summonerSpellName,
} from "../../../utils/i18n";

export const RecommendedBuild: Component = () => {
    const { t } = useI18n();
    const { recommendedBuild } = useBuild();

    const build = () => {
        const result = recommendedBuild();
        return result?.available ? result.build : undefined;
    };

    return (
        <Panel>
            <PanelHeader>{t("build.recommended")}</PanelHeader>
            <Show
                when={build()}
                fallback={
                    <p class="text-neutral-500">
                        {t("build.recommended.empty")}
                    </p>
                }
            >
                {(b) => (
                    <div class="flex flex-col gap-4">
                        <p class="text-neutral-500">
                            {t("build.recommended.note")}
                        </p>
                        <ImportToClientButton build={b()} />
                        <div class="grid gap-4 md:grid-cols-2">
                            <Show when={b().runes}>
                                {(runes) => <RunesSection runes={runes()} />}
                            </Show>
                            <div class="flex flex-col gap-4">
                                <Show when={b().summonerSpells}>
                                    {(slot) => (
                                        <Section
                                            title={t("build.summonerSpells")}
                                        >
                                            <SlotRow
                                                slot={slot()}
                                                render={(ids) => (
                                                    <SpellNames ids={ids} />
                                                )}
                                            />
                                        </Section>
                                    )}
                                </Show>
                                <Show when={b().startingItems}>
                                    {(slot) => (
                                        <Section
                                            title={t("build.startingItems")}
                                        >
                                            <SlotRow
                                                slot={slot()}
                                                render={(ids) => (
                                                    <ItemNames ids={ids} />
                                                )}
                                            />
                                        </Section>
                                    )}
                                </Show>
                                <Show when={b().boots}>
                                    {(slot) => (
                                        <Section title={t("build.boots")}>
                                            <SlotRow
                                                slot={slot()}
                                                render={(id) => (
                                                    <ItemNames ids={[id]} />
                                                )}
                                            />
                                        </Section>
                                    )}
                                </Show>
                                <Show when={b().coreItems.length > 0}>
                                    <Section
                                        title={t("build.recommended.coreItems")}
                                    >
                                        <For each={b().coreItems}>
                                            {(slot, i) => (
                                                <SlotRow
                                                    label={t("build.itemN", {
                                                        n: i() + 1,
                                                    })}
                                                    slot={slot}
                                                    render={(id) => (
                                                        <ItemNames ids={[id]} />
                                                    )}
                                                />
                                            )}
                                        </For>
                                    </Section>
                                </Show>
                                <Show when={b().skillOrder}>
                                    {(slot) => (
                                        <Section
                                            title={t("build.skillPriority")}
                                        >
                                            <SlotRow
                                                slot={slot()}
                                                render={(order) => (
                                                    <span class="text-xl">
                                                        {order
                                                            .split("")
                                                            .join(" > ")}
                                                    </span>
                                                )}
                                            />
                                        </Section>
                                    )}
                                </Show>
                            </div>
                        </div>
                    </div>
                )}
            </Show>
        </Panel>
    );
};

const Section: Component<{ title: string; children: JSX.Element }> = (
    props,
) => (
    <div class="flex flex-col gap-2 bg-[#141414] p-3 rounded-md">
        <h3 class="uppercase font-semibold">{props.title}</h3>
        {props.children}
    </div>
);

const RunesSection: Component<{
    runes: RecommendedRunes;
}> = (props) => {
    const { t } = useI18n();
    const { dataset } = useDataset();
    const { config } = useUser();

    const pathName = (id: number) => {
        const path = dataset()!.runePathData[id];
        return path ? runePathName(path, config) : String(id);
    };
    const RuneName = (p: { id: number }) => {
        const rune = () => dataset()!.runeData[p.id];
        return <span>{rune() ? runeName(rune(), config) : p.id}</span>;
    };
    const ShardName = (p: { id: number }) => {
        const shard = () => dataset()!.statShardData[p.id];
        return <span>{shard() ? statShardName(shard(), config) : p.id}</span>;
    };

    return (
        <Section title={t("build.runes")}>
            <h4 class="text-neutral-500">
                {t("build.recommended.primaryPath", {
                    path: pathName(props.runes.primaryPathId),
                })}
            </h4>
            <For each={props.runes.primary}>
                {(slot) => (
                    <SlotRow
                        slot={slot}
                        render={(id) => <RuneName id={id} />}
                    />
                )}
            </For>
            <h4 class="text-neutral-500">
                {t("build.recommended.secondaryPath", {
                    path: pathName(props.runes.secondaryPathId),
                })}
            </h4>
            <For each={props.runes.secondary}>
                {(slot) => (
                    <SlotRow
                        slot={slot}
                        render={(id) => <RuneName id={id} />}
                    />
                )}
            </For>
            <h4 class="text-neutral-500">{t("build.shards")}</h4>
            <For each={props.runes.shards}>
                {(slot) => (
                    <SlotRow
                        slot={slot}
                        render={(id) => <ShardName id={id} />}
                    />
                )}
            </For>
        </Section>
    );
};

const ItemNames: Component<{ ids: number[] }> = (props) => {
    const { dataset } = useDataset();
    const { config } = useUser();

    return (
        <span class="flex gap-1 items-center flex-wrap">
            <For each={props.ids}>
                {(id) => (
                    <span class="flex gap-1 items-center">
                        <img
                            src={`https://ddragon.leagueoflegends.com/cdn/${
                                dataset()!.version
                            }/img/item/${id}.png`}
                            class="w-8 h-8 rounded-sm"
                        />
                        <span>
                            {dataset()!.itemData[id]
                                ? itemName(dataset()!.itemData[id], config)
                                : id}
                        </span>
                    </span>
                )}
            </For>
        </span>
    );
};

const SpellNames: Component<{ ids: number[] }> = (props) => {
    const { dataset } = useDataset();
    const { config } = useUser();

    return (
        <span class="flex gap-3 items-center flex-wrap">
            <For each={props.ids}>
                {(key) => {
                    const spell = () => dataset()!.summonerSpellData[key];
                    return (
                        <span class="flex gap-1 items-center">
                            <Show when={spell()}>
                                <img
                                    src={`https://ddragon.leagueoflegends.com/cdn/${
                                        dataset()!.version
                                    }/img/spell/${spell().id}.png`}
                                    class="w-8 h-8 rounded-sm"
                                />
                            </Show>
                            <span>
                                {spell()
                                    ? summonerSpellName(spell(), config)
                                    : key}
                            </span>
                        </span>
                    );
                }}
            </For>
        </span>
    );
};

function SlotRow<T>(props: {
    slot: BuildSlot<T>;
    render: (value: T) => JSX.Element;
    label?: string;
}) {
    const { t } = useI18n();

    return (
        <div class="flex flex-col gap-1">
            <Show when={props.label}>
                <span class="text-neutral-500 text-sm">{props.label}</span>
            </Show>
            <div class="flex items-center justify-between gap-3">
                <div class="font-semibold">
                    {props.render(props.slot.choice.value)}
                </div>
                <ChoiceStats choice={props.slot.choice} />
            </div>
            <Show when={props.slot.alternatives.length > 0}>
                <div class="flex flex-col gap-1 pl-3 text-sm text-neutral-400">
                    <span class="uppercase text-xs text-neutral-500">
                        {t("build.recommended.alternatives")}
                    </span>
                    <For each={props.slot.alternatives}>
                        {(alternative) => (
                            <div class="flex items-center justify-between gap-3">
                                {props.render(alternative.value)}
                                <ChoiceStats choice={alternative} />
                            </div>
                        )}
                    </For>
                </div>
            </Show>
        </div>
    );
}

function ChoiceStats(props: { choice: BuildChoice<unknown> }) {
    const { t } = useI18n();

    return (
        <span class="flex gap-2 items-center shrink-0 text-sm">
            <span>{formatPercentage(props.choice.winrate)}%</span>
            <span class="text-neutral-500">
                {t("build.recommended.games", {
                    games: props.choice.games.toLocaleString(),
                })}
            </span>
            <Show when={props.choice.lowConfidence}>
                <span class="text-winrate-meh">
                    {t("build.recommended.lowConfidence")}
                </span>
            </Show>
        </span>
    );
}
