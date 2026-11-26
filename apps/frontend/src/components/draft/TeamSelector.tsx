import { For } from "solid-js";
import { getPickedChampionKey, useDraft } from "../../contexts/DraftContext";
import { Team } from "@draftgap/core/src/models/Team";
import { useI18n } from "../../contexts/I18nContext";

const TEAMS = ["ally", "opponent"] as const;

export function TeamSelector() {
    const { selection, select, allyTeam, opponentTeam, bans } = useDraft();
    const { teamName } = useI18n();

    function selectTeam(team: Team) {
        select(team, undefined, { type: selection.type });
    }

    const isTeamFull = (team: Team) =>
        selection.type === "ban"
            ? bans[team].every((ban) => ban !== undefined)
            : (team === "ally" ? allyTeam : opponentTeam).every(
                  (p) => getPickedChampionKey(p) !== undefined,
              );

    return (
        <span class="isolate inline-flex overflow-hidden rounded-md border border-pg-ln2">
            <For each={TEAMS}>
                {(team, i) => (
                    <button
                        type="button"
                        class="relative inline-flex h-7 items-center px-2 text-xs text-pg-mu hover:enabled:text-pg-tx focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-pg-ac disabled:pointer-events-none disabled:opacity-30"
                        classList={{
                            "border-l border-pg-ln2": i() !== 0,
                            "bg-pg-s3! text-pg-tx!": selection.team === team,
                        }}
                        aria-pressed={selection.team === team}
                        onClick={() => selectTeam(team)}
                        disabled={isTeamFull(team)}
                    >
                        {teamName(team)}
                    </button>
                )}
            </For>
        </span>
    );
}
