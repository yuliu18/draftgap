import { Component } from "solid-js";
import { SummaryCard } from "../views/analysis/SummaryCards";
import { hashtag, presentationChartLine } from "solid-heroicons/solid";
import { winrateToRating } from "@draftgap/core/src/rating/ratings";
import { DialogContent, DialogHeader, DialogTitle } from "../common/Dialog";
import { useI18n } from "../../contexts/I18nContext";

type Props = {
    data: {
        rating: number;
        games: number;
        wins: number;
    };
};

export const WinrateDecompositionDialog: Component<Props> = (props) => {
    const { t } = useI18n();

    return (
        <DialogContent class="max-w-3xl">
            <DialogHeader>
                <DialogTitle>{t("winrateDecomp.title")}</DialogTitle>
            </DialogHeader>
            <div
                class={`grid overflow-hidden rounded-lg bg-primary grid-cols-2 sm:grid-cols-3`}
            >
                <SummaryCard
                    class="py-2!"
                    icon={presentationChartLine}
                    title={t("winrateDecomp.draftgap")}
                    rating={props.data.rating}
                    tooltip={<>{t("winrateDecomp.draftgap.tip")}</>}
                />
                <SummaryCard
                    class="py-2!"
                    icon={presentationChartLine}
                    title={t("winrateDecomp.observed")}
                    rating={winrateToRating(props.data.wins / props.data.games)}
                    tooltip={<>{t("winrateDecomp.observed.tip")}</>}
                />
                <SummaryCard
                    class="py-2!"
                    icon={hashtag}
                    title={t("winrateDecomp.games")}
                    number={Math.ceil(props.data.games)}
                    tooltip={<>{t("winrateDecomp.games.tip")}</>}
                />
            </div>
        </DialogContent>
    );
};
