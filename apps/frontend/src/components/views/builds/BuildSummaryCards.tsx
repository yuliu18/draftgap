import { Component, JSX } from "solid-js";
import { useBuild } from "../../../contexts/BuildContext";
import { SummaryCard } from "../analysis/SummaryCards";
import {
    arrowsRightLeft,
    presentationChartLine,
    user,
} from "solid-heroicons/solid";
import { useI18n } from "../../../contexts/I18nContext";
import { useUser } from "../../../contexts/UserContext";
import {
    itemName,
    runeName,
    statShardName,
    summonerSpellName,
} from "../../../utils/i18n";
import { useDataset } from "../../../contexts/DatasetContext";
import { cn } from "../../../utils/style";

export const BuildSummaryCards: Component<
    JSX.HTMLAttributes<HTMLDivElement>
> = (props) => {
    const { dataset } = useDataset();
    const { t } = useI18n();
    const { config } = useUser();
    const { selectedEntity, buildAnalysisResult } = useBuild();

    const title = () =>
        ({
            rune: t("build.card.rune"),
            item: t("build.card.item"),
            summonerSpells: t("build.card.summonerSpell"),
            skills: t("build.card.skills"),
        })[selectedEntity()!.type];
    const name = () => {
        const selected = selectedEntity()!;
        switch (selected.type) {
            case "rune":
                if (selected.runeType.startsWith("shard-")) {
                    return statShardName(
                        dataset()!.statShardData[selected.id],
                        config,
                    );
                }
                return runeName(dataset()!.runeData[selected.id], config);
            case "item":
                switch (selected.itemType) {
                    case "startingSets":
                        return t("build.startingItems");
                    case "sets":
                        return t("build.build");
                    default:
                        return itemName(
                            dataset()!.itemData[selected.id],
                            config,
                        );
                }
            case "summonerSpells": {
                const spells = selected.id.split("_");
                return spells
                    .map((id) =>
                        summonerSpellName(
                            dataset()!.summonerSpellData[+id],
                            config,
                        ),
                    )
                    .join(" + ");
            }
            case "skills": {
                switch (selected.skillsType) {
                    case "order":
                        return t("build.skillPriority");
                    case "level":
                        return t("build.card.skills");
                }
            }
        }
    };

    const runeAnalysisResult = () => {
        const selected = selectedEntity();
        if (selected?.type !== "rune") return undefined;

        switch (selected.runeType) {
            case "primary":
                return buildAnalysisResult()?.runes.primary[selected.id];
            case "secondary":
                return buildAnalysisResult()?.runes.secondary[selected.id];
            case "shard-offense":
                return buildAnalysisResult()?.runes.shards.offense[selected.id];
            case "shard-flex":
                return buildAnalysisResult()?.runes.shards.flex[selected.id];
            case "shard-defense":
                return buildAnalysisResult()?.runes.shards.defense[selected.id];
        }
    };

    const itemAnalysisResult = () => {
        const selected = selectedEntity();
        if (selected?.type !== "item") return undefined;

        if (selected.itemType === "boots") {
            return buildAnalysisResult()!.items.boots[selected.id];
        }
        if (selected.itemType === "startingSets") {
            return buildAnalysisResult()!.items.startingSets[selected.id];
        }
        if (selected.itemType === "sets") {
            return buildAnalysisResult()!.items.sets[selected.id];
        }

        return buildAnalysisResult()!.items.statsByOrder[selected.itemType][
            selectedEntity()!.id
        ];
    };

    const summonerSpellAnalysisResult = () => {
        const selected = selectedEntity();
        if (selected?.type !== "summonerSpells") return undefined;

        return buildAnalysisResult()!.summonerSpells[selected.id];
    };

    const skillAnalysisResult = () => {
        const selected = selectedEntity();
        if (selected?.type !== "skills") return undefined;

        switch (selected.skillsType) {
            case "order":
                return buildAnalysisResult()!.skills.order[selected.id];
            case "level":
                return buildAnalysisResult()!.skills.levels[selected.level][
                    selected.id
                ];
        }
    };

    const analysisResult = () => {
        const selected = selectedEntity()!;
        switch (selected.type) {
            case "rune":
                return runeAnalysisResult();
            case "item":
                return itemAnalysisResult();
            case "summonerSpells":
                return summonerSpellAnalysisResult();
            case "skills":
                return skillAnalysisResult();
            default:
                selected satisfies never;
        }
    };

    const baseRating = () => {
        return analysisResult()!.baseResult.rating;
    };

    const matchupRating = () => {
        return analysisResult()!.matchupResult.totalRating;
    };

    const totalRating = () => {
        return analysisResult()!.totalRating;
    };

    return (
        <div
            {...props}
            class={cn(
                "grid overflow-hidden rounded-lg bg-primary grid-cols-2 sm:grid-cols-3",
                props.class,
            )}
        >
            <SummaryCard
                class="py-2!"
                icon={user}
                title={title()}
                rating={baseRating()}
                tooltip={<>{t("build.card.base.tip", { name: name() })}</>}
            />
            <SummaryCard
                class="py-2!"
                icon={arrowsRightLeft}
                title={t("card.matchups")}
                rating={matchupRating()}
                tooltip={<>{t("build.card.matchups.tip", { name: name() })}</>}
            />
            <SummaryCard
                class="py-2!"
                icon={presentationChartLine}
                title={t("card.total")}
                rating={totalRating()}
                tooltip={<>{t("build.card.total.tip", { name: name() })}</>}
            />
        </div>
    );
};
