import { ChampionData } from "@draftgap/core/src/models/dataset/ChampionData";
import { DraftGapConfig } from "@draftgap/core/src/models/user/Config";
import { championName } from "./i18n";

function normalizeSearch(str: string) {
    // Strip accents so typing "dragon" finds names such as "Dragón".
    return str
        .normalize("NFD")
        .replaceAll(/[\u0300-\u036f]/g, "")
        .replaceAll(/[^a-zA-Z0-9一-鿿]/g, "")
        .toLowerCase();
}

export function championMatchesSearch(
    champion: ChampionData,
    search: string,
    config: DraftGapConfig,
) {
    const str = normalizeSearch(search);
    return (
        normalizeSearch(champion.name).includes(str) ||
        normalizeSearch(championName(champion, config)).includes(str)
    );
}
