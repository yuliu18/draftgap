import { createSignal } from "solid-js";
import { ChampionData } from "@draftgap/core/src/models/dataset/ChampionData";
import { ItemData } from "@draftgap/core/src/models/dataset/ItemData";
import {
    RuneData,
    RunePathData,
    StatShardData,
} from "@draftgap/core/src/models/dataset/RuneData";
import { SummonerSpellData } from "@draftgap/core/src/models/dataset/SummonerSpellData";
import { DraftGapConfig } from "@draftgap/core/src/models/user/Config";
import {
    LocalizedGameNames,
    STAT_SHARD_NAMES_ES,
    localizedName,
} from "@draftgap/core/src/i18n/ddragon-names";
import { SPANISH_LANGUAGE } from "@draftgap/core/src/i18n/messages";

// Names loaded from Data Dragon for the current UI language (set by the
// I18nProvider). Undefined while loading or when loading failed, in which
// case every lookup falls back to the dataset's English name.
const [gameNames, setGameNames] = createSignal<LocalizedGameNames>();
export { setGameNames };

export function championName(champion: ChampionData, config: DraftGapConfig) {
    if (config.language === "en_US") {
        return champion.name;
    }
    if (config.language === SPANISH_LANGUAGE) {
        return localizedName(
            gameNames()?.champions,
            champion.key,
            champion.name,
        );
    }

    return champion.i18n[config.language]?.name ?? champion.name;
}

const isSpanish = (config: DraftGapConfig) =>
    config.language === SPANISH_LANGUAGE;

export function itemName(item: ItemData, config: DraftGapConfig) {
    if (!isSpanish(config)) return item.name;
    return localizedName(gameNames()?.items, item.id, item.name);
}

export function runeName(rune: RuneData, config: DraftGapConfig) {
    if (!isSpanish(config)) return rune.name;
    return localizedName(gameNames()?.runes, rune.id, rune.name);
}

export function runePathName(path: RunePathData, config: DraftGapConfig) {
    if (!isSpanish(config)) return path.name;
    return localizedName(gameNames()?.runePaths, path.id, path.name);
}

export function statShardName(shard: StatShardData, config: DraftGapConfig) {
    if (!isSpanish(config)) return shard.name;
    return STAT_SHARD_NAMES_ES[shard.key] ?? shard.name;
}

export function summonerSpellName(
    spell: SummonerSpellData,
    config: DraftGapConfig,
) {
    if (!isSpanish(config)) return spell.name;
    return localizedName(gameNames()?.summonerSpells, spell.key, spell.name);
}
