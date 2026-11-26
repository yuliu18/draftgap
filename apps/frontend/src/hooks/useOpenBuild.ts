import { Role } from "@draftgap/core/src/models/Role";
import { getPickedChampionKey, useDraft } from "../contexts/DraftContext";
import { useBuild } from "../contexts/BuildContext";
import { useDraftView } from "../contexts/DraftViewContext";
import { useI18n } from "../contexts/I18nContext";
import { createMustSelectToast } from "../utils/toast";

/**
 * Opens the Build view for a suggested champion. The Build view works on
 * picks, so the champion is placed in the selected slot first (the same
 * pick a click on its table row makes), keeping the selection where it is.
 */
export function useOpenBuild() {
    const { selection, allyTeam, opponentTeam, pickChampion } = useDraft();
    const { setBuildPick } = useBuild();
    const { setCurrentDraftView } = useDraftView();
    const { t } = useI18n();

    return (championKey: string, role: Role) => {
        if (selection.type !== "pick" || !selection.team) {
            createMustSelectToast(t);
            return;
        }
        const team = selection.team;
        const index = selection.index;
        const current = (team === "ally" ? allyTeam : opponentTeam)[index];
        if (
            getPickedChampionKey(current) !== championKey ||
            current.role !== role
        ) {
            pickChampion(team, index, championKey, role, {
                updateSelection: false,
                resetFilters: false,
                updateView: false,
            });
        }
        setBuildPick({ team, index });
        setCurrentDraftView({ type: "builds" });
    };
}
