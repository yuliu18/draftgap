import { useI18n } from "../../../contexts/I18nContext";
import { Match, Show, Switch } from "solid-js";
import { isTauri } from "@tauri-apps/api/core";
import { RuneTable } from "./RuneTable";
import { useBuild } from "../../../contexts/BuildContext";
import { BootsStats } from "./BootsStats";
import { ItemStats } from "./ItemStats";
import { StarterItemStats } from "./StarterItemStats";
import { SummonerSpellsStats } from "./SummonerSpellsStats";
import { SkillStats } from "./SkillStats";
import { RecommendedBuild } from "./RecommendedBuild";
import { ImportToClientButton } from "./ImportToClientButton";
import { BuildDataNeedsDesktopError } from "@draftgap/core/src/builds/lolalytics-page";

export function BuildView(props: { details: boolean }) {
    const { query, buildAnalysisResult, recommendedBuild } = useBuild();
    const { t } = useI18n();
    const build = () => {
        const result = recommendedBuild();
        return result?.available ? result.build : undefined;
    };

    return (
        <Switch
            fallback={
                <p class="grid flex-1 place-items-center p-4 text-pg-mu">
                    {t("build.recommended.empty")}
                </p>
            }
        >
            <Match when={query.isLoading}>
                <p
                    role="status"
                    class="grid flex-1 place-items-center p-4 text-pg-mu"
                >
                    {t("build.loading")}
                </p>
            </Match>
            <Match when={query.isError}>
                <p
                    role="status"
                    class="grid flex-1 place-items-center p-4 text-pg-neg"
                >
                    {query.error instanceof BuildDataNeedsDesktopError
                        ? t("build.needsDesktop")
                        : t("build.fetchError")}
                </p>
            </Match>
            <Match when={query.isSuccess && buildAnalysisResult()}>
                <div class="min-h-0 flex-1 overflow-auto p-4">
                    <Show when={props.details} fallback={<RecommendedBuild />}>
                        <div class="pro-build-details grid gap-4">
                            <RuneTable />
                            <SummonerSpellsStats />
                            <StarterItemStats />
                            <SkillStats />
                            <BootsStats />
                            <ItemStats />
                        </div>
                    </Show>
                </div>
                <Show when={isTauri() && build()}>
                    {(current) => (
                        <footer class="flex min-h-16 shrink-0 flex-wrap items-center justify-between gap-3 border-t border-pg-ln bg-pg-s1 px-4 py-2">
                            <p class="text-xs text-pg-dim">
                                {t("build.recommended.note")}
                            </p>
                            <ImportToClientButton build={current()} />
                        </footer>
                    )}
                </Show>
            </Match>
        </Switch>
    );
}
