import { ratingToWinrate } from "@draftgap/core/src/rating/ratings";
import { useExtraDraftAnalysis } from "../../../contexts/ExtraDraftAnalysisContext";
import { Chart } from "../../common/Chart";
import { ChartConfiguration } from "chart.js";
import { useDataset } from "../../../contexts/DatasetContext";
import { formatRating } from "../../../utils/rating";
import { useI18n } from "../../../contexts/I18nContext";
import { useUser } from "../../../contexts/UserContext";
import { championName } from "../../../utils/i18n";

export function ScalingChart() {
    const { allyDraftExtraAnalysis, opponentDraftExtraAnalysis } =
        useExtraDraftAnalysis();
    const { dataset } = useDataset();
    const { t, teamName } = useI18n();
    const { config } = useUser();

    const labels = ["0-20", "20-25", "25-30", "30-35", "35+"];

    const allyRatings = () => allyDraftExtraAnalysis()?.ratingByTime ?? [];
    const opponentRatings = () =>
        opponentDraftExtraAnalysis()?.ratingByTime ?? [];

    return (
        <Chart
            chart={
                {
                    type: "line",
                    data: {
                        labels,
                        datasets: [
                            {
                                label: teamName("ally").toUpperCase(),
                                data: allyRatings().map(
                                    (result) =>
                                        Math.round(
                                            ratingToWinrate(
                                                result.totalRating,
                                            ) * 10000,
                                        ) / 100,
                                ),
                                borderColor: "#3c82f6",
                            },
                            {
                                label: teamName("opponent").toUpperCase(),
                                data: opponentRatings().map(
                                    (result) =>
                                        Math.round(
                                            ratingToWinrate(
                                                result.totalRating,
                                            ) * 10000,
                                        ) / 100,
                                ),
                                borderColor: "#ef4444",
                            },
                        ],
                    },
                    options: {
                        pointStyle: false,
                        plugins: {
                            legend: {
                                display: false,
                            },
                            tooltip: {
                                callbacks: {
                                    label(context) {
                                        const ratings = [
                                            allyRatings(),
                                            opponentRatings(),
                                        ][context.datasetIndex];
                                        const result =
                                            ratings[context.dataIndex];

                                        const championString =
                                            result.championResults
                                                .sort((a, b) => a.role - b.role)
                                                .map(
                                                    (r) =>
                                                        `${championName(
                                                            dataset()!
                                                                .championData[
                                                                r.championKey
                                                            ],
                                                            config,
                                                        ).toUpperCase()} - ${formatRating(
                                                            r.rating,
                                                        )}`,
                                                );

                                        return [
                                            ...championString,
                                            "",
                                            t("analysis.chart.total", {
                                                value: formatRating(
                                                    result.totalRating,
                                                ),
                                            }),
                                        ];
                                    },
                                },
                            },
                        },
                        borderCapStyle: "round",
                        borderWidth: 4,
                        tension: 0.1,
                        scales: {
                            y: {
                                grid: {
                                    color(info) {
                                        if (info.tick.value === 50)
                                            return "#9b9b9b";

                                        return "#404040";
                                    },
                                },
                            },
                        },
                    },
                } as ChartConfiguration
            }
        />
    );
}
