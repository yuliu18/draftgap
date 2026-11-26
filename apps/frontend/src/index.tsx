/* @refresh reload */
import { JSXElement } from "solid-js";
import { render } from "solid-js/web";

import "./index.css";
import App from "./App";
import { DraftProvider } from "./contexts/DraftContext";
import { LolClientProvider } from "./contexts/LolClientContext";
import { setupAnalytics } from "./utils/analytics";
import { TooltipProvider } from "./contexts/TooltipContext";
import { Toaster } from "solid-toast";
import { setupMobileVH } from "./utils/mobile";
import { QueryClient, QueryClientProvider } from "@tanstack/solid-query";
import { BuildProvider } from "./contexts/BuildContext";
import { DraftViewProvider } from "./contexts/DraftViewContext";
import { UserProvider } from "./contexts/UserContext";
import { PersonalProvider } from "./contexts/PersonalContext";
import { LlmProvider } from "./contexts/LlmContext";
import { DraftSuggestionsProvider } from "./contexts/DraftSuggestionsContext";
import { DraftAnalysisProvider } from "./contexts/DraftAnalysisContext";
import { DatasetProvider } from "./contexts/DatasetContext";
import { I18nProvider } from "./contexts/I18nContext";
import { DraftFiltersProvider } from "./contexts/DraftFiltersContext";
import { ExtraDraftAnalysisProvider } from "./contexts/ExtraDraftAnalysisContext";

setupMobileVH();
setupAnalytics();

// Game names are loaded for the dataset version, so i18n sits inside the dataset.
const DatasetI18nProvider = (props: { children: JSXElement }) => (
    <DatasetProvider>
        <I18nProvider>{props.children}</I18nProvider>
    </DatasetProvider>
);

const queryClient = new QueryClient();

render(
    () => (
        <QueryClientProvider client={queryClient}>
            <UserProvider>
                <DatasetI18nProvider>
                    <TooltipProvider>
                        <DraftViewProvider>
                            <DraftFiltersProvider>
                                <DraftProvider>
                                    <DraftAnalysisProvider>
                                        <ExtraDraftAnalysisProvider>
                                            <PersonalProvider>
                                                <DraftSuggestionsProvider>
                                                    <LlmProvider>
                                                        <BuildProvider>
                                                            <LolClientProvider>
                                                                <App />
                                                                <Toaster
                                                                    position="bottom-right"
                                                                    toastOptions={{
                                                                        duration:
                                                                            Infinity,
                                                                    }}
                                                                />
                                                            </LolClientProvider>
                                                        </BuildProvider>
                                                    </LlmProvider>
                                                </DraftSuggestionsProvider>
                                            </PersonalProvider>
                                        </ExtraDraftAnalysisProvider>
                                    </DraftAnalysisProvider>
                                </DraftProvider>
                            </DraftFiltersProvider>
                        </DraftViewProvider>
                    </TooltipProvider>
                </DatasetI18nProvider>
            </UserProvider>
        </QueryClientProvider>
    ),
    document.getElementById("root") as HTMLElement,
);
