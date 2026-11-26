import { Role } from "../models/Role";
import { DEFAULT_PERSONAL_QUEUE_IDS } from "../personal/lcu-match-history";

// Pure mapping of the raw scouting pieces gathered by the Tauri command
// `get_scouting_snapshot` (src-tauri/src/scouting.rs) into a typed snapshot.
// Everything is read defensively: it never throws, missing data yields
// `unknown` / null fields. The raw LCU shapes are observed for ranked-stats
// and match history; the gameflow teamOne/teamTwo player entry is NOT
// observed in a real game (see odd/tasks/personal-draft.md, T12).

export const RECENT_GAMES = 10;
export const SUMMONERS_RIFT_MAP_ID = 11;
const TOP_CHAMPIONS = 3;

export type ScoutingRawPlayer = {
    team?: unknown;
    player?: unknown;
    lookedUp?: unknown;
    ranked?: unknown;
    matches?: unknown;
    rankedError?: unknown;
    matchesError?: unknown;
};

export type ScoutingRaw = {
    status?: unknown;
    phase?: unknown;
    queueId?: unknown;
    players?: unknown;
};

export type RankInfo =
    | {
          status: "ranked";
          /** e.g. "BRONZE", "MASTER". */
          tier: string;
          /** "I".."IV"; undefined for apex tiers. */
          division?: string;
          leaguePoints: number;
          wins: number;
          losses: number;
          /** 0..1, undefined when no games. */
          winrate?: number;
      }
    | { status: "unranked" }
    | { status: "unknown" };

export type RecentChampion = {
    championId: number;
    games: number;
    wins: number;
};

export type RecentPerformance = {
    games: number;
    wins: number;
    /** 0..1 */
    winrate: number;
    kills: number;
    deaths: number;
    assists: number;
    /** (kills + assists) / max(1, deaths) over the whole sample. */
    kda: number;
    topChampions: RecentChampion[];
};

export type ScoutedPlayer = {
    /** teamOne = 1 (blue side), teamTwo = 2 (red side). */
    team: 1 | 2;
    championId?: number;
    role?: Role;
    riotId?: string;
    isBot: boolean;
    /** False for bots and players without a valid puuid. */
    lookedUp: boolean;
    solo: RankInfo;
    flex: RankInfo;
    /** Undefined when not fetched, failed, or no Summoner's Rift games. */
    recent?: RecentPerformance;
    rankedFailed: boolean;
    matchesFailed: boolean;
};

export type ScoutingSnapshot =
    | { status: "not_available"; phase: string }
    | {
          status: "available";
          phase: string;
          queueId?: number;
          players: ScoutedPlayer[];
      };

type Rec = Record<string, unknown>;

const asRecord = (v: unknown): Rec | undefined =>
    typeof v === "object" && v !== null && !Array.isArray(v)
        ? (v as Rec)
        : undefined;

const finite = (v: unknown): v is number =>
    typeof v === "number" && Number.isFinite(v);

const nonEmptyString = (v: unknown): v is string =>
    typeof v === "string" && v.trim() !== "";

function roleFromPosition(position: unknown): Role | undefined {
    if (typeof position !== "string") return undefined;
    switch (position.toUpperCase()) {
        case "TOP":
            return Role.Top;
        case "JUNGLE":
            return Role.Jungle;
        case "MIDDLE":
        case "MID":
            return Role.Middle;
        case "BOTTOM":
        case "BOT":
            return Role.Bottom;
        case "UTILITY":
        case "SUPPORT":
            return Role.Support;
    }
    return undefined;
}

function isBot(player: Rec): boolean {
    if (player.isBot === true) return true;
    const d = player.botDifficulty;
    if (finite(d)) return d > 0;
    if (typeof d === "string") return !["", "NONE", "0"].includes(d);
    return false;
}

function riotIdOf(player: Rec): string | undefined {
    const { gameName, tagLine, summonerName } = player;
    if (nonEmptyString(gameName)) {
        return nonEmptyString(tagLine) ? `${gameName}#${tagLine}` : gameName;
    }
    return nonEmptyString(summonerName) ? summonerName : undefined;
}

const SOLO = "RANKED_SOLO_5x5";
const FLEX = "RANKED_FLEX_SR";

function rankFromEntry(entry: Rec): RankInfo {
    const tier = entry.tier;
    if (
        !nonEmptyString(tier) ||
        tier.toUpperCase() === "NONE" ||
        tier.toUpperCase() === "UNRANKED"
    ) {
        return { status: "unranked" };
    }
    const wins = finite(entry.wins) ? entry.wins : 0;
    const losses = finite(entry.losses) ? entry.losses : 0;
    const division =
        nonEmptyString(entry.division) && entry.division !== "NA"
            ? entry.division
            : undefined;
    return {
        status: "ranked",
        tier: tier.toUpperCase(),
        ...(division ? { division } : {}),
        leaguePoints: finite(entry.leaguePoints) ? entry.leaguePoints : 0,
        wins,
        losses,
        ...(wins + losses > 0 ? { winrate: wins / (wins + losses) } : {}),
    };
}

/** Solo/duo and flex from `lol-ranked/v1/ranked-stats/{puuid}`. */
export function mapRankedStats(raw: unknown): {
    solo: RankInfo;
    flex: RankInfo;
} {
    const unknown = {
        solo: { status: "unknown" },
        flex: { status: "unknown" },
    };
    try {
        const root = asRecord(raw);
        if (!root) return unknown as never;
        const entries: Rec[] = [];
        if (Array.isArray(root.queues)) {
            for (const e of root.queues) {
                const r = asRecord(e);
                if (r) entries.push(r);
            }
        }
        const queueMap = asRecord(root.queueMap);
        const find = (queueType: string): RankInfo => {
            const entry =
                entries.find((e) => e.queueType === queueType) ??
                asRecord(queueMap?.[queueType]);
            if (entry) return rankFromEntry(entry);
            // A well-formed response without the queue means never ranked.
            return entries.length > 0 || queueMap
                ? { status: "unranked" }
                : { status: "unknown" };
        };
        return { solo: find(SOLO), flex: find(FLEX) };
    } catch {
        return unknown as never;
    }
}

/**
 * Last `limit` Summoner's Rift games of `lol-match-history/.../matches`
 * (participants[0] is the looked-up player). Undefined without usable games.
 */
export function mapRecentPerformance(
    raw: unknown,
    limit = RECENT_GAMES,
): RecentPerformance | undefined {
    try {
        const games = asRecord(asRecord(raw)?.games)?.games;
        if (!Array.isArray(games)) return undefined;

        let wins = 0;
        let kills = 0;
        let deaths = 0;
        let assists = 0;
        let count = 0;
        const byChampion = new Map<number, RecentChampion>();

        for (const entry of games) {
            if (count >= limit) break;
            const game = asRecord(entry);
            if (!game) continue;
            const { queueId, mapId } = game;
            if (
                !finite(queueId) ||
                !(DEFAULT_PERSONAL_QUEUE_IDS as readonly number[]).includes(
                    queueId,
                )
            ) {
                continue;
            }
            if (finite(mapId) && mapId !== SUMMONERS_RIFT_MAP_ID) continue;
            const participant = Array.isArray(game.participants)
                ? asRecord(game.participants[0])
                : undefined;
            const stats = asRecord(participant?.stats);
            const championId = participant?.championId;
            if (
                !participant ||
                !stats ||
                !finite(championId) ||
                typeof stats.win !== "boolean" ||
                !finite(stats.kills) ||
                !finite(stats.deaths) ||
                !finite(stats.assists)
            ) {
                continue;
            }
            count++;
            if (stats.win) wins++;
            kills += stats.kills;
            deaths += stats.deaths;
            assists += stats.assists;
            const c = byChampion.get(championId) ?? {
                championId,
                games: 0,
                wins: 0,
            };
            c.games++;
            if (stats.win) c.wins++;
            byChampion.set(championId, c);
        }

        if (count === 0) return undefined;
        // Array.prototype.sort is stable: ties keep the most recent first.
        const topChampions = [...byChampion.values()]
            .sort((a, b) => b.games - a.games || b.wins - a.wins)
            .slice(0, TOP_CHAMPIONS);
        return {
            games: count,
            wins,
            winrate: wins / count,
            kills,
            deaths,
            assists,
            kda: (kills + assists) / Math.max(1, deaths),
            topChampions,
        };
    } catch {
        return undefined;
    }
}

function mapPlayer(entry: unknown): ScoutedPlayer | undefined {
    const raw = asRecord(entry);
    if (!raw) return undefined;
    const team = raw.team === 2 ? 2 : raw.team === 1 ? 1 : undefined;
    if (team === undefined) return undefined;
    const player = asRecord(raw.player) ?? {};
    const lookedUp = raw.lookedUp === true;
    const championId =
        finite(player.championId) && player.championId > 0
            ? player.championId
            : undefined;
    const role = roleFromPosition(player.selectedPosition);
    const riotId = riotIdOf(player);
    const ranked = lookedUp ? mapRankedStats(raw.ranked) : undefined;
    const recent = lookedUp ? mapRecentPerformance(raw.matches) : undefined;
    return {
        team,
        ...(championId !== undefined ? { championId } : {}),
        ...(role !== undefined ? { role } : {}),
        ...(riotId ? { riotId } : {}),
        isBot: isBot(player),
        lookedUp,
        solo: ranked?.solo ?? { status: "unknown" },
        flex: ranked?.flex ?? { status: "unknown" },
        ...(recent ? { recent } : {}),
        rankedFailed: lookedUp && nonEmptyString(raw.rankedError),
        matchesFailed: lookedUp && nonEmptyString(raw.matchesError),
    };
}

/** Maps the raw Tauri result. Never throws; anything unusable is not_available. */
export function mapScoutingSnapshot(raw: unknown): ScoutingSnapshot {
    try {
        const root = asRecord(raw) as ScoutingRaw | undefined;
        const phase = typeof root?.phase === "string" ? root.phase : "None";
        if (!root || root.status !== "available") {
            return { status: "not_available", phase };
        }
        const players: ScoutedPlayer[] = [];
        if (Array.isArray(root.players)) {
            for (const p of root.players) {
                try {
                    const mapped = mapPlayer(p);
                    if (mapped) players.push(mapped);
                } catch {
                    continue;
                }
            }
        }
        return {
            status: "available",
            phase,
            ...(finite(root.queueId) ? { queueId: root.queueId } : {}),
            players,
        };
    } catch {
        return { status: "not_available", phase: "None" };
    }
}
