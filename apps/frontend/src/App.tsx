import { Component, createEffect, Match, Switch } from "solid-js";
import { useLolClient } from "./contexts/LolClientContext";
import { BuildsView } from "./components/views/builds/BuildsView";
import { useDraftView } from "./contexts/DraftViewContext";
import { useUser } from "./contexts/UserContext";
import { useDataset } from "./contexts/DatasetContext";
import { LoadingIcon } from "./components/icons/LoadingIcon";
import { Dialog } from "./components/common/Dialog";
import { UpdateDialog } from "./components/dialogs/UpdateDialog";
import { useDraftAnalysis } from "./contexts/DraftAnalysisContext";
import { ChampionDraftAnalysisDialog } from "./components/dialogs/ChampionDraftAnalysisDialog";
import { useI18n } from "./contexts/I18nContext";
import { TopBar } from "./components/shell/TopBar";
import { MatchPlaceholder } from "./components/shell/MatchPlaceholder";
import { SelectionScreen } from "./components/draft/SelectionScreen";
import { AccountPage } from "./components/account/AccountPage";

const App: Component = () => {
    const { config } = useUser();
    const { t } = useI18n();
    const { currentDraftView } = useDraftView();
    const { dataset, isLoaded } = useDataset();
    const { analysisPick, setAnalysisPick, showAnalysisPick } =
        useDraftAnalysis();
    const { startLolClientIntegration, stopLolClientIntegration } =
        useLolClient();

    createEffect(() => {
        if (config.disableLeagueClientIntegration) {
            stopLolClientIntegration();
        } else {
            startLolClientIntegration();
        }
    });

    return (
        <div
            class="flex h-screen flex-col overflow-hidden bg-pg-bg font-pro text-[13px] leading-4 text-pg-tx tabular-nums"
            style={{
                height: "calc(var(--vh, 1vh) * 100)",
            }}
        >
            <UpdateDialog />
            <TopBar />
            <main class="flex min-h-0 flex-1 flex-col">
                <Switch>
                    <Match
                        when={
                            dataset.state === "ready" && dataset() === undefined
                        }
                    >
                        <div class="flex h-full items-center justify-center text-2xl text-red-500">
                            {t("app.unexpectedError")}
                        </div>
                    </Match>
                    <Match when={!isLoaded()}>
                        <div class="flex h-full items-center justify-center text-2xl">
                            <LoadingIcon class="h-10 w-10 animate-spin" />
                        </div>
                    </Match>
                    <Match when={isLoaded()}>
                        <Dialog
                            open={showAnalysisPick()}
                            onOpenChange={(open) => {
                                if (!open) setAnalysisPick(undefined);
                            }}
                        >
                            <ChampionDraftAnalysisDialog
                                championKey={analysisPick()!.championKey}
                                team={analysisPick()!.team}
                                openChampionDraftAnalysisModal={(
                                    team,
                                    championKey,
                                ) => setAnalysisPick({ team, championKey })}
                            />
                        </Dialog>
                        <Switch>
                            <Match
                                when={
                                    currentDraftView().type === "draft" ||
                                    currentDraftView().type === "analysis"
                                }
                            >
                                <SelectionScreen />
                            </Match>
                            <Match when={currentDraftView().type === "builds"}>
                                <div class="flex min-h-0 flex-1 flex-col overflow-auto bg-pg-bg">
                                    <div class="flex min-h-full flex-1 flex-col">
                                        <BuildsView />
                                    </div>
                                </div>
                            </Match>
                            <Match when={currentDraftView().type === "match"}>
                                <MatchPlaceholder />
                            </Match>
                            <Match when={currentDraftView().type === "account"}>
                                <AccountPage />
                            </Match>
                        </Switch>
                    </Match>
                </Switch>
            </main>
        </div>
    );
};

export default App;
