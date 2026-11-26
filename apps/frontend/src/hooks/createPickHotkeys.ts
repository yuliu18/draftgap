import { Team } from "@draftgap/core/src/models/Team";
import { Role } from "@draftgap/core/src/models/Role";
import { useDraft } from "../contexts/DraftContext";
import { useDraftAnalysis } from "../contexts/DraftAnalysisContext";
import { useDataset } from "../contexts/DatasetContext";
import { useUser } from "../contexts/UserContext";
import { useMedia } from "./useMedia";
import { linkByStatsSite } from "../utils/sites";
import { openUrl } from "@tauri-apps/plugin-opener";

/**
 * Hover keyboard shortcuts of a pick slot (b: stats site, r / backspace /
 * delete: reset, f: analysis), the same as the pick cards had.
 */
export function createPickHotkeys(team: () => Team, index: () => number) {
    const { config } = useUser();
    const { dataset } = useDataset();
    const { allyTeam, opponentTeam, pickChampion } = useDraft();
    const { allyTeamComp, opponentTeamComp, setAnalysisPick } =
        useDraftAnalysis();
    const { isDesktop } = useMedia();

    const pick = () => (team() === "ally" ? allyTeam : opponentTeam)[index()];

    const listener = (event: KeyboardEvent) => {
        if (event.ctrlKey || event.altKey || event.metaKey) return;
        if ((event.target as HTMLElement).tagName === "INPUT") return;

        const championKey = pick().championKey;
        if (event.key === "b") {
            if (!championKey) return;
            const comp =
                team() === "ally" ? allyTeamComp() : opponentTeamComp();
            const role = [...comp.entries()].find(
                ([, value]) => value === championKey,
            )?.[0];
            const champion = dataset()?.championData[championKey];
            if (role === undefined || !champion) return;
            event.preventDefault();
            const link = linkByStatsSite(
                config.defaultStatsSite,
                champion.id,
                role as Role,
            );
            if (isDesktop) {
                openUrl(link);
            } else {
                window.open(link, "_blank");
            }
        } else if (
            event.key === "r" ||
            event.key === "Backspace" ||
            event.key === "Delete"
        ) {
            event.preventDefault();
            pickChampion(team(), index(), undefined, undefined);
        } else if (event.key === "f") {
            if (!championKey) return;
            setAnalysisPick({ team: team(), championKey });
        }
    };

    return {
        onMouseOver: () => document.addEventListener("keydown", listener),
        onMouseOut: () => document.removeEventListener("keydown", listener),
    };
}
