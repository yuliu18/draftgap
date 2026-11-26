import { Icon } from "solid-heroicons";
import {
    arrowsRightLeft,
    users,
    user,
    presentationChartLine,
} from "solid-heroicons/solid";
import { JSX } from "solid-js/jsx-runtime";
import { Team } from "@draftgap/core/src/models/Team";
import { tooltip } from "../../../directives/tooltip";
import { RatingText } from "../../common/RatingText";
import { Component, Show } from "solid-js";
import { useI18n } from "../../../contexts/I18nContext";
import { useUser } from "../../../contexts/UserContext";
import { championName } from "../../../utils/i18n";
import { useDraftAnalysis } from "../../../contexts/DraftAnalysisContext";
import { useDataset } from "../../../contexts/DatasetContext";
import { cn } from "../../../utils/style";
// eslint-disable-next-line
tooltip;

export const SummaryCard = (
    props: {
        team?: Team;
        title: string;
        icon: {
            path: JSX.Element;
            outline: boolean;
            mini: boolean;
        };
        rating?: number;
        number?: number;
        href?: string;
        tooltip: JSX.Element;
    } & JSX.HTMLAttributes<HTMLDivElement>,
) => {
    const colorClasses = () => {
        if (!props.team) return "bg-[#101010]";

        return props.team === "ally" ? "bg-[#3c82f6]" : "bg-opponent";
    };

    return (
        <a
            {...props}
            class={cn(
                "px-4 py-5 flex gap-4 items-center text-left",
                props.class,
            )}
            // @ts-ignore
            use:tooltip={{
                content: props.tooltip,
            }}
        >
            <div
                class={`rounded-full h-[48px] w-[48px] flex items-center justify-center ${colorClasses()}`}
            >
                <Icon path={props.icon} class="w-6" />
            </div>
            <div>
                <div class="text-lg text-neutral-400 uppercase">
                    {props.title}
                </div>
                <div class="flex items-baseline justify-between md:block lg:flex -mt-1">
                    <div class="flex items-baseline text-3xl">
                        <Show
                            when={props.rating !== undefined}
                            fallback={props.number}
                        >
                            <RatingText rating={props.rating!} />
                        </Show>
                    </div>
                </div>
            </div>
        </a>
    );
};

export const DraftSummaryCards = (
    props: { team: Team } & JSX.HTMLAttributes<HTMLDivElement>,
) => {
    const { allyDraftAnalysis, opponentDraftAnalysis } = useDraftAnalysis();
    const { t, teamName } = useI18n();

    const draftResult = () =>
        props.team === "ally" ? allyDraftAnalysis()! : opponentDraftAnalysis()!;

    const teamParams = () => ({
        team: teamName(props.team),
        teamLower: teamName(props.team).toLowerCase(),
    });

    return (
        <div
            {...props}
            class={cn(
                "grid divide-neutral-700 overflow-hidden rounded-lg bg-primary grid-cols-2 md:grid-cols-4 md:divide-x",
                props.class,
            )}
        >
            <SummaryCard
                team={props.team}
                icon={user}
                title={t("card.champions")}
                rating={draftResult().allyChampionRating.totalRating}
                href="#champions-result"
                tooltip={<>{t("card.teamChampions.tip", teamParams())}</>}
            />
            <SummaryCard
                team={props.team}
                icon={arrowsRightLeft}
                title={t("card.matchups")}
                rating={draftResult().matchupRating.totalRating}
                href="#matchup-result"
                tooltip={<>{t("card.teamMatchups.tip", teamParams())}</>}
            />
            <SummaryCard
                team={props.team}
                icon={users}
                title={t("card.duos")}
                rating={draftResult().allyDuoRating.totalRating}
                href="#duo-result"
                tooltip={<>{t("card.teamDuos.tip", teamParams())}</>}
            />
            <SummaryCard
                team={props.team}
                icon={presentationChartLine}
                title={t("card.winrate")}
                rating={draftResult().totalRating}
                href="#total-result"
                tooltip={<>{t("card.teamTotal.tip", teamParams())}</>}
            />
        </div>
    );
};

type ChampionSummaryCardProps = {
    championKey: string;
    team: Team;
} & JSX.HTMLAttributes<HTMLDivElement>;

export const ChampionSummaryCards: Component<ChampionSummaryCardProps> = (
    props,
) => {
    const { dataset } = useDataset();
    const { allyDraftAnalysis, opponentDraftAnalysis } = useDraftAnalysis();

    const draftResult = () =>
        props.team === "ally" ? allyDraftAnalysis()! : opponentDraftAnalysis()!;

    const { t } = useI18n();
    const { config } = useUser();

    const name = () =>
        championName(dataset()!.championData[props.championKey], config);

    const baseChampionRating = () =>
        draftResult().allyChampionRating.championResults.find(
            (r) => r.championKey === props.championKey,
        )?.rating ?? 0;

    const duoRating = () =>
        draftResult()
            .allyDuoRating.duoResults.filter(
                (r) =>
                    r.championKeyA === props.championKey ||
                    r.championKeyB === props.championKey,
            )
            .reduce((acc, r) => acc + r.rating / 2, 0);

    const matchupRating = () =>
        draftResult()
            .matchupRating.matchupResults.filter(
                (r) =>
                    r.championKeyA === props.championKey ||
                    r.championKeyB === props.championKey,
            )
            .reduce((acc, r) => acc + r.rating, 0);

    const totalRating = () =>
        baseChampionRating() + duoRating() + matchupRating();

    return (
        <div
            {...props}
            class={cn(
                "grid overflow-hidden rounded-lg bg-primary grid-cols-2 sm:grid-cols-4",
                props.class,
            )}
        >
            <SummaryCard
                class="py-2!"
                icon={user}
                title={t("card.champion")}
                rating={baseChampionRating()}
                tooltip={<>{t("card.champBase.tip", { name: name() })}</>}
            />
            <SummaryCard
                class="py-2!"
                icon={arrowsRightLeft}
                title={t("card.matchups")}
                rating={matchupRating()}
                href="#matchup-champion-result"
                tooltip={<>{t("card.champMatchups.tip", { name: name() })}</>}
            />
            <SummaryCard
                class="py-2!"
                icon={users}
                title={t("card.duos")}
                rating={duoRating()}
                href="#duo-champion-result"
                tooltip={<>{t("card.champDuos.tip", { name: name() })}</>}
            />
            <SummaryCard
                class="py-2!"
                icon={presentationChartLine}
                title={t("card.winrate")}
                rating={totalRating()}
                tooltip={<>{t("card.champTotal.tip", { name: name() })}</>}
            />
        </div>
    );
};
