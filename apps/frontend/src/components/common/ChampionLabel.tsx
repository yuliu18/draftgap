import { useDataset } from "../../contexts/DatasetContext";
import { useUser } from "../../contexts/UserContext";
import { championName } from "../../utils/i18n";
import { ChampionIcon } from "../icons/ChampionIcon";

/** Portrait and name of a champion, for the companion UI tables. */
export function ChampionLabel(props: { championKey: string; size?: number }) {
    const { dataset } = useDataset();
    const { config } = useUser();

    return (
        <span class="flex items-center gap-2 text-left">
            <ChampionIcon
                championKey={props.championKey}
                size={props.size ?? 28}
            />
            <span class="font-semibold">
                {championName(
                    dataset()!.championData[props.championKey],
                    config,
                )}
            </span>
        </span>
    );
}
