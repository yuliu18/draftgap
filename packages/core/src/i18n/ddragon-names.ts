// Localized game names from Data Dragon. The upstream dataset only carries
// English names (plus zh_CN for champions), so other languages are loaded at
// runtime and fall back to the dataset's English names.

export type NameMap = Record<string, string>;

export type LocalizedGameNames = {
    champions: NameMap;
    items: NameMap;
    runes: NameMap;
    runePaths: NameMap;
    summonerSpells: NameMap;
};

export function ddragonNamesUrls(version: string, locale: string) {
    const base = `https://ddragon.leagueoflegends.com/cdn/${version}/data/${locale}`;
    return {
        champions: `${base}/champion.json`,
        items: `${base}/item.json`,
        runes: `${base}/runesReforged.json`,
        summonerSpells: `${base}/summoner.json`,
    };
}

// Stat shards are not part of Data Dragon, keyed by the dataset's shard key.
export const STAT_SHARD_NAMES_ES: NameMap = {
    HealthScaling: "Escalado de vida",
    AttackSpeed: "Velocidad de ataque",
    CDRScaling: "Celeridad de habilidad",
    AdaptiveForce: "Fuerza adaptable",
    Flex: "Flexible",
    Health: "Vida",
    TenacityAndSlowResist: "Tenacidad y resistencia a ralentización",
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

const usableName = (value: unknown) =>
    typeof value === "string" && value.trim() !== "" ? value : undefined;

const dataRecord = (json: unknown) =>
    isRecord(json) && isRecord(json.data) ? json.data : {};

// champion.json and summoner.json: entries carry a numeric `key` as a string.
function mapByEntryKey(json: unknown): NameMap {
    const result: NameMap = {};
    for (const entry of Object.values(dataRecord(json))) {
        if (!isRecord(entry)) continue;
        const name = usableName(entry.name);
        const entryKey = entry["key"];
        if (name === undefined || typeof entryKey !== "string") continue;
        result[entryKey] = name;
    }
    return result;
}

export const mapChampionNames = mapByEntryKey;
export const mapSummonerSpellNames = mapByEntryKey;

export function mapItemNames(json: unknown): NameMap {
    const result: NameMap = {};
    for (const [id, entry] of Object.entries(dataRecord(json))) {
        const name = isRecord(entry) ? usableName(entry.name) : undefined;
        if (name !== undefined) result[id] = name;
    }
    return result;
}

export function mapRuneNames(json: unknown) {
    const paths: NameMap = {};
    const runes: NameMap = {};
    if (!Array.isArray(json)) return { paths, runes };

    for (const path of json) {
        if (!isRecord(path)) continue;
        const pathName = usableName(path.name);
        if (pathName !== undefined && typeof path.id === "number") {
            paths[String(path.id)] = pathName;
        }
        if (!Array.isArray(path.slots)) continue;
        for (const slot of path.slots) {
            if (!isRecord(slot) || !Array.isArray(slot.runes)) continue;
            for (const rune of slot.runes) {
                if (!isRecord(rune)) continue;
                const name = usableName(rune.name);
                if (name !== undefined && typeof rune.id === "number") {
                    runes[String(rune.id)] = name;
                }
            }
        }
    }
    return { paths, runes };
}

export function localizedName(
    names: NameMap | undefined,
    id: string | number,
    fallback: string,
) {
    return names?.[String(id)] ?? fallback;
}
