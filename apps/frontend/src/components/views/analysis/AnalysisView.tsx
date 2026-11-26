import { useI18n } from "../../../contexts/I18nContext";
import { createSignal, Show } from "solid-js";
import { Seg } from "../../common/Pro";
import { DuoResultTable } from "./DuoResultTable";
import { IndividualChampionsResultTable } from "./IndividualChampionsResultTable";
import { MatchupResultTable } from "./MatchupResultTable";
import { DraftSummaryCards } from "./SummaryCards";
import { TotalChampionContributionTable } from "./TotalChampionContributionTable";
import { tooltip } from "../../../directives/tooltip";
import { Team } from "@draftgap/core/src/models/Team";
import { useUser } from "../../../contexts/UserContext";
import { useDraftAnalysis } from "../../../contexts/DraftAnalysisContext";
import { ScalingChart } from "./ScalingChart";
// eslint-disable-next-line
tooltip;

export default function AnalysisView() {
    const { config } = useUser();
    const { t } = useI18n();
    const { setAnalysisPick } = useDraftAnalysis();
    const [showAllMatchups, setShowAllMatchups] = createSignal(false);

    const openChampionDraftAnalysisModal = (
        team: Team,
        championKey: string,
    ) => {
        setAnalysisPick({ team, championKey });
    };

    return (
        <div class="pro-analysis min-w-0">
            <DraftSummaryCards team="ally" />
            <DraftSummaryCards team="opponent" class="mb-5 mt-3" />

            <div class="pro-analysis-pair mb-4" id="total-result">
                <div class="md:w-1/2">
                    <h3
                        class="text-3xl mb-1 uppercase ml-4"
                        // @ts-ignore
                        use:tooltip={{
                            content: (
                                <>
                                    {t("analysis.contrib.intro")}
                                    <br />
                                    <br />
                                    <strong>
                                        {t("col.base").toUpperCase()}
                                    </strong>
                                    : {t("analysis.contrib.base")}
                                    <br />
                                    <strong>
                                        {t("col.matchup").toUpperCase()}
                                    </strong>
                                    : {t("analysis.contrib.matchup")}
                                    <br />
                                    <strong>
                                        {t("col.duo").toUpperCase()}
                                    </strong>
                                    : {t("analysis.contrib.duo")}
                                    <br />
                                    <strong>
                                        {t("col.total").toUpperCase()}
                                    </strong>
                                    : {t("analysis.contrib.total")}
                                </>
                            ),
                        }}
                    >
                        {t("analysis.allyOverview")}
                    </h3>
                    <TotalChampionContributionTable
                        team="ally"
                        onClickChampion={(key) =>
                            openChampionDraftAnalysisModal("ally", key)
                        }
                    />
                </div>
                <div class="md:w-1/2">
                    <h3
                        class="text-3xl mb-1 uppercase ml-4"
                        // @ts-ignore
                        use:tooltip={{
                            content: (
                                <>
                                    {t("analysis.contrib.intro")}
                                    <br />
                                    <br />
                                    <strong>
                                        {t("col.base").toUpperCase()}
                                    </strong>
                                    : {t("analysis.contrib.base")}
                                    <br />
                                    <strong>
                                        {t("col.matchup").toUpperCase()}
                                    </strong>
                                    : {t("analysis.contrib.matchup")}
                                    <br />
                                    <strong>
                                        {t("col.duo").toUpperCase()}
                                    </strong>
                                    : {t("analysis.contrib.duo")}
                                    <br />
                                    <strong>
                                        {t("col.total").toUpperCase()}
                                    </strong>
                                    : {t("analysis.contrib.total")}
                                </>
                            ),
                        }}
                    >
                        {t("analysis.opponentOverview")}
                    </h3>
                    <TotalChampionContributionTable
                        team="opponent"
                        onClickChampion={(key) =>
                            openChampionDraftAnalysisModal("opponent", key)
                        }
                    />
                </div>
            </div>

            <Show when={!config.ignoreChampionWinrates}>
                <div class="pro-analysis-pair mb-4" id="champions-result">
                    <div class="sm:w-1/2">
                        <h3
                            class="text-3xl uppercase mb-1 ml-4"
                            // @ts-ignore
                            use:tooltip={{
                                content: <>{t("analysis.baseWinrates.tip")}</>,
                            }}
                        >
                            {t("analysis.allyChampions")}
                        </h3>
                        <IndividualChampionsResultTable
                            team="ally"
                            onClickChampion={(championKey) =>
                                openChampionDraftAnalysisModal(
                                    "ally",
                                    championKey,
                                )
                            }
                        />
                    </div>
                    <div class="sm:w-1/2">
                        <h3
                            class="text-3xl uppercase mb-1 ml-4"
                            // @ts-ignore
                            use:tooltip={{
                                content: <>{t("analysis.baseWinrates.tip")}</>,
                            }}
                        >
                            {t("analysis.opponentChampions")}
                        </h3>
                        <IndividualChampionsResultTable
                            team="opponent"
                            onClickChampion={(championKey) =>
                                openChampionDraftAnalysisModal(
                                    "opponent",
                                    championKey,
                                )
                            }
                        />
                    </div>
                </div>
            </Show>

            <div
                class="flex-col flex md:flex-row justify-between gap-2 md:items-end mb-2 items-end"
                id="matchup-result"
            >
                <div>
                    <h3
                        class="text-3xl uppercase ml-4"
                        // @ts-ignore
                        use:tooltip={{
                            content: <>{t("analysis.matchupsAll.tip")}</>,
                        }}
                    >
                        {t("analysis.matchups")}
                    </h3>
                    <p
                        class="text-neutral-500 uppercase ml-4"
                        // @ts-ignore
                        use:tooltip={{
                            content: (
                                <>{t("analysis.matchups.normalizedBias.tip")}</>
                            ),
                        }}
                    >
                        {t("analysis.matchups.normalized")}
                    </p>
                </div>
                <Seg
                    options={[
                        { label: t("analysis.h2h"), value: false },
                        { label: t("analysis.all"), value: true },
                    ]}
                    value={showAllMatchups()}
                    onChange={setShowAllMatchups}
                />
            </div>
            <MatchupResultTable
                class="w-full mb-8"
                showAll={showAllMatchups()}
                onClickChampion={(team, championKey) =>
                    openChampionDraftAnalysisModal(team, championKey)
                }
            />

            <div class="pro-analysis-pair mb-4" id="duo-result">
                <div class="md:w-1/2">
                    <h3
                        class="text-3xl uppercase ml-4"
                        // @ts-ignore
                        use:tooltip={{
                            content: <>{t("analysis.allyDuos.tip")}</>,
                        }}
                    >
                        {t("analysis.allyDuos")}
                    </h3>
                    <p
                        class="text-neutral-500 uppercase ml-4 mb-2"
                        // @ts-ignore
                        use:tooltip={{
                            content: <>{t("analysis.duos.normalized.tip")}</>,
                        }}
                    >
                        {t("analysis.matchups.normalized")}
                    </p>
                    <DuoResultTable
                        team="ally"
                        onClickChampion={(key) =>
                            openChampionDraftAnalysisModal("ally", key)
                        }
                    />
                </div>
                <div class="md:w-1/2">
                    <h3
                        class="text-3xl uppercase ml-4"
                        // @ts-ignore
                        use:tooltip={{
                            content: <>{t("analysis.opponentDuos.tip")}</>,
                        }}
                    >
                        {t("analysis.opponentDuos")}
                    </h3>
                    <p
                        class="text-neutral-500 uppercase ml-4 mb-2"
                        // @ts-ignore
                        use:tooltip={{
                            content: <>{t("analysis.duos.normalized.tip")}</>,
                        }}
                    >
                        {t("analysis.matchups.normalized")}
                    </p>
                    <DuoResultTable
                        team="opponent"
                        onClickChampion={(key) =>
                            openChampionDraftAnalysisModal("opponent", key)
                        }
                    />
                </div>
            </div>

            {/* <div class="mb-2 mt-16 flex justify-center items-center gap-2">
                <div class="h-[3px] bg-neutral-700 w-24" />

                <h2 class="text-4xl uppercase text-neutral-500 text-center">
                    Misc
                </h2>

                <div class="h-[3px] bg-neutral-700 w-24" />
            </div> */}

            <div>
                <h3 class="text-3xl uppercase ml-4">{t("analysis.scaling")}</h3>
                <span
                    class="text-neutral-500 uppercase ml-4 mb-2"
                    // @ts-ignore
                    use:tooltip={{
                        content: <>{t("analysis.teamNormalized.tip")}</>,
                    }}
                >
                    {t("analysis.teamNormalized")}
                </span>
                <div class="h-64 w-full max-w-2xl rounded-lg border border-pg-ln bg-pg-s1 p-4">
                    <ScalingChart />
                </div>
            </div>
        </div>
    );
}
