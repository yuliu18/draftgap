import { For, Show, createSignal } from "solid-js";
import { useI18n } from "../../../contexts/I18nContext";
import { useUser } from "../../../contexts/UserContext";
import { championName } from "../../../utils/i18n";
import { Team } from "@draftgap/core/src/models/Team";
import { getPickedChampionKey, useDraft } from "../../../contexts/DraftContext";
import { BuildView } from "./BuildView";
import { useBuild } from "../../../contexts/BuildContext";
import { useDraftAnalysis } from "../../../contexts/DraftAnalysisContext";
import { useDataset } from "../../../contexts/DatasetContext";
import { Dialog } from "../../common/Dialog";
import { Seg } from "../../common/Pro";
import { ChampionLabel } from "../../common/ChampionLabel";
import { BuildAnalysisDialog } from "../../dialogs/BuildAnalysisDialog";

const teams: Team[] = ["ally", "opponent"];

export const BuildsView = () => {
    const { allyTeam, opponentTeam } = useDraft();
    const { allyTeamComp, opponentTeamComp } = useDraftAnalysis();
    const { dataset } = useDataset();
    const { config } = useUser();
    const {
        buildPick,
        setBuildPick,
        championKey,
        championRole,
        selectedEntity,
        setSelectedEntity,
        showSelectedEntity,
        buildAnalysisResult,
    } = useBuild();
    const { t, teamName, roleName } = useI18n();
    const [details, setDetails] = createSignal(false);
    const options = (team: Team) =>
        (team === "ally" ? allyTeam : opponentTeam).flatMap((pick, index) => {
            const key = getPickedChampionKey(pick);
            const champion = key ? dataset()?.championData[key] : undefined;
            return champion
                ? [
                      {
                          pick: { team, index },
                          value: `${team}:${index}`,
                          label: championName(champion, config),
                      },
                  ]
                : [];
        });
    const opponent = () => {
        const role = championRole();
        const team =
            buildPick()?.team === "ally" ? opponentTeamComp() : allyTeamComp();
        return role === undefined ? undefined : team?.get(role);
    };

    return (
        <div class="flex min-h-0 flex-1 flex-col">
            <header class="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-pg-ln bg-pg-s1 px-4 py-2 empty:hidden">
                <Show when={championKey()}>
                    {(key) => (
                        <h1 class="flex items-center gap-2 text-sm">
                            <ChampionLabel championKey={key()} size={40} />
                            <Show when={championRole() !== undefined}>
                                <span class="text-pg-mu">
                                    · {roleName(championRole()!)}
                                </span>
                            </Show>
                        </h1>
                    )}
                </Show>
                <Show when={opponent()}>
                    {(key) => (
                        <span class="flex items-center gap-2 text-pg-mu">
                            {t("build.pro.versus")}{" "}
                            <ChampionLabel championKey={key()} size={28} />
                        </span>
                    )}
                </Show>
                <Show
                    when={options("ally").length || options("opponent").length}
                >
                    <label class="ml-auto flex items-center gap-2 text-xs text-pg-mu">
                        {t("build.pro.viewChampion")}
                        <select
                            class="h-8 rounded-md border border-pg-ln2 bg-pg-s2 px-2 text-pg-tx"
                            value={
                                buildPick()
                                    ? `${buildPick()!.team}:${buildPick()!.index}`
                                    : ""
                            }
                            onChange={(e) => {
                                const value = e.currentTarget.value;
                                const option = teams
                                    .flatMap(options)
                                    .find((entry) => entry.value === value);
                                if (option) setBuildPick(option.pick);
                            }}
                        >
                            <option value="" disabled>
                                {t("build.selectChampion")}
                            </option>
                            <For each={teams}>
                                {(team) => (
                                    <Show when={options(team).length}>
                                        <optgroup label={teamName(team)}>
                                            <For each={options(team)}>
                                                {(option) => (
                                                    <option
                                                        value={option.value}
                                                    >
                                                        {option.label}
                                                    </option>
                                                )}
                                            </For>
                                        </optgroup>
                                    </Show>
                                )}
                            </For>
                        </select>
                    </label>
                </Show>
                <Show when={buildAnalysisResult()}>
                    <Seg
                        options={[
                            { value: false, label: t("build.recommended") },
                            { value: true, label: t("build.pro.details") },
                        ]}
                        value={details()}
                        onChange={setDetails}
                    />
                </Show>
            </header>
            <Show
                when={buildPick()}
                fallback={
                    <p class="grid flex-1 place-items-center p-4 text-pg-mu">
                        {t("build.selectChampion")}
                    </p>
                }
            >
                <BuildView details={details()} />
            </Show>
            <Show
                when={selectedEntity() !== undefined && buildAnalysisResult()}
            >
                <Dialog
                    open={showSelectedEntity()}
                    onOpenChange={() => setSelectedEntity(undefined)}
                >
                    <BuildAnalysisDialog />
                </Dialog>
            </Show>
        </div>
    );
};
