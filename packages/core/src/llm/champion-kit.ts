// Compact champion kit (passive, Q/W/E/R) from a Data Dragon per-champion
// file. Used to ground the matchup chat on live data, not on model memory.

export type KitAbility = {
    slot: "Passive" | "Q" | "W" | "E" | "R";
    name: string;
    description?: string;
    /** Cooldown in seconds for each rank. */
    cooldowns?: number[];
    cost?: string;
    range?: string;
};

export type ChampionKit = {
    id: string;
    name: string;
    title?: string;
    resource?: string;
    abilities: KitAbility[];
};

const SPELL_SLOTS = ["Q", "W", "E", "R"] as const;
const MAX_DESCRIPTION_LENGTH = 240;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

const text = (value: unknown) =>
    typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;

const ENTITIES: Record<string, string> = {
    "&nbsp;": " ",
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
};

export function plainText(html: string) {
    const cleaned = html
        .replace(/<br\s*\/?>/gi, " ")
        .replace(/<[^>]*>/g, "")
        .replace(/&(nbsp|amp|lt|gt|quot|#39);/g, (m) => ENTITIES[m] ?? m)
        .replace(/\s+/g, " ")
        .trim();
    return cleaned.length > MAX_DESCRIPTION_LENGTH
        ? `${cleaned.slice(0, MAX_DESCRIPTION_LENGTH).trimEnd()}…`
        : cleaned;
}

function mapAbility(
    slot: KitAbility["slot"],
    raw: unknown,
): KitAbility | undefined {
    if (!isRecord(raw)) return undefined;
    const name = text(raw.name);
    if (name === undefined) return undefined;
    const ability: KitAbility = { slot, name };

    const description = text(raw.description);
    if (description !== undefined) {
        const plain = plainText(description);
        if (plain !== "") ability.description = plain;
    }
    if (Array.isArray(raw.cooldown)) {
        const cooldowns = raw.cooldown.filter(
            (n): n is number => typeof n === "number" && Number.isFinite(n),
        );
        if (cooldowns.length > 0) ability.cooldowns = cooldowns;
    }
    const cost = text(raw.costBurn);
    // "0" is Data Dragon's way of saying "no cost".
    if (cost !== undefined && cost !== "0") ability.cost = cost;
    const range = text(raw.rangeBurn);
    if (range !== undefined) ability.range = range;
    return ability;
}

/** `json` is the whole file; its single `data` entry is the champion. */
export function mapChampionKit(json: unknown): ChampionKit | undefined {
    if (!isRecord(json) || !isRecord(json.data)) return undefined;
    const raw = Object.values(json.data)[0];
    if (!isRecord(raw)) return undefined;
    const id = text(raw.id);
    if (id === undefined) return undefined;

    const abilities: KitAbility[] = [];
    const passive = mapAbility("Passive", raw.passive);
    if (passive) abilities.push(passive);
    const spells: unknown[] = Array.isArray(raw.spells) ? raw.spells : [];
    {
        SPELL_SLOTS.forEach((slot, i) => {
            const ability = mapAbility(slot, spells[i]);
            if (ability) abilities.push(ability);
        });
    }

    return {
        id,
        name: text(raw.name) ?? id,
        title: text(raw.title),
        resource: text(raw.partype),
        abilities,
    };
}

export function formatChampionKit(kit: ChampionKit) {
    const lines = [`${kit.name}${kit.title ? `, ${kit.title}` : ""}`];
    if (kit.resource) lines[0] += ` (resource: ${kit.resource})`;
    for (const a of kit.abilities) {
        const facts: string[] = [];
        if (a.cooldowns) facts.push(`cooldown ${a.cooldowns.join("/")}s`);
        if (a.cost) facts.push(`cost ${a.cost}`);
        if (a.range) facts.push(`range ${a.range}`);
        lines.push(
            `- ${a.slot}: ${a.name}${facts.length ? ` [${facts.join(", ")}]` : ""}${
                a.description ? ` - ${a.description}` : ""
            }`,
        );
    }
    return lines.join("\n");
}

export function championKitUrl(
    version: string,
    locale: string,
    championId: string,
) {
    return `https://ddragon.leagueoflegends.com/cdn/${version}/data/${locale}/champion/${championId}.json`;
}

export type FetchLike = (url: string) => Promise<Response>;

/**
 * Per-session in-memory cache keyed by version, locale and champion. Failures
 * resolve to undefined and are not cached, so a later call retries.
 */
export function createChampionKitLoader(fetchFn: FetchLike) {
    const cache = new Map<string, Promise<ChampionKit | undefined>>();

    return function loadChampionKit(
        version: string,
        locale: string,
        championId: string,
    ) {
        const key = `${version}:${locale}:${championId}`;
        const cached = cache.get(key);
        if (cached) return cached;

        const promise = (async () => {
            try {
                const response = await fetchFn(
                    championKitUrl(version, locale, championId),
                );
                if (!response.ok) return undefined;
                return mapChampionKit(await response.json());
            } catch {
                return undefined;
            }
        })().then((kit) => {
            if (kit === undefined) cache.delete(key);
            return kit;
        });
        cache.set(key, promise);
        return promise;
    };
}
