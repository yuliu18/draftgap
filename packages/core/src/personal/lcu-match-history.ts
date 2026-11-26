import { Role } from "../models/Role";
import { PersonalMatch, PersonalPerf } from "./personal-stats";

export const DEFAULT_PERSONAL_QUEUE_IDS = [420, 440] as const;

type Rec = Record<string, unknown>;

function asRecord(value: unknown): Rec | undefined {
    return typeof value === "object" && value !== null
        ? (value as Rec)
        : undefined;
}

function upper(value: unknown) {
    return typeof value === "string" ? value.toUpperCase() : "";
}

function roleFromPosition(position: unknown): Role | undefined {
    switch (upper(position)) {
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

function roleFromParticipant(participant: Rec): Role | undefined {
    const timeline = asRecord(participant.timeline);

    const lane = upper(timeline?.lane);
    const role = upper(timeline?.role);
    switch (lane) {
        case "TOP":
            return Role.Top;
        case "JUNGLE":
            return Role.Jungle;
        case "MIDDLE":
        case "MID":
            return Role.Middle;
        case "BOTTOM":
        case "BOT":
            if (role === "DUO_CARRY" || role === "CARRY") return Role.Bottom;
            if (role === "DUO_SUPPORT" || role === "SUPPORT") {
                return Role.Support;
            }
    }

    // Direct position strings, in case the client provides them.
    // Bottom/Support are only accepted here when unambiguous (e.g. UTILITY).
    for (const candidate of [
        timeline?.position,
        timeline?.teamPosition,
        timeline?.individualPosition,
        participant.position,
        participant.teamPosition,
        participant.individualPosition,
    ]) {
        const direct = roleFromPosition(candidate);
        if (direct !== undefined) return direct;
    }
    return undefined;
}

const finite = (v: unknown): v is number =>
    typeof v === "number" && Number.isFinite(v);

// The community-documented LCU shape (participants[0].stats and the game's
// gameDuration). Not verified against a live client.
function perfFromGame(game: Rec, participant: Rec): PersonalPerf | undefined {
    const stats = asRecord(participant.stats);
    if (!stats) return undefined;

    const perf: PersonalPerf = {};
    const put = (field: keyof PersonalPerf, value: unknown) => {
        if (finite(value) && value >= 0) perf[field] = value;
    };
    put("kills", stats.kills);
    put("deaths", stats.deaths);
    put("assists", stats.assists);
    // Lane minions are required for cs; missing neutral monsters count as 0.
    if (finite(stats.totalMinionsKilled) && stats.totalMinionsKilled >= 0) {
        const neutral =
            finite(stats.neutralMinionsKilled) &&
            stats.neutralMinionsKilled >= 0
                ? stats.neutralMinionsKilled
                : 0;
        perf.cs = stats.totalMinionsKilled + neutral;
    }
    put("gold", stats.goldEarned);
    put("damage", stats.totalDamageDealtToChampions);
    put("vision", stats.visionScore);

    const duration = game.gameDuration;
    if (finite(duration) && duration > 0) {
        // gameDuration is seconds in most client versions but milliseconds in
        // some: no real game lasts over 20000 seconds (5.5 h), so larger
        // values are treated as milliseconds.
        perf.duration = duration > 20000 ? duration / 1000 : duration;
    }

    // queueId is stored alongside performance data, not as data by itself.
    if (Object.keys(perf).length === 0) return undefined;
    if (finite(game.queueId)) perf.queueId = game.queueId;
    return perf;
}

export function mapLcuMatchHistory(
    raw: unknown,
    championKeyById: (id: number) => string | undefined,
    options?: { queueIds?: readonly number[] },
): PersonalMatch[] {
    const queueIds = options?.queueIds ?? DEFAULT_PERSONAL_QUEUE_IDS;
    const games = asRecord(asRecord(raw)?.games)?.games;
    if (!Array.isArray(games)) return [];

    const result: PersonalMatch[] = [];
    for (const entry of games) {
        try {
            const game = asRecord(entry);
            if (!game) continue;

            const { queueId, gameCreation, gameId } = game;
            if (typeof queueId !== "number" || !queueIds.includes(queueId)) {
                continue;
            }
            if (
                typeof gameCreation !== "number" ||
                !Number.isFinite(gameCreation)
            ) {
                continue;
            }

            const participants = game.participants;
            if (!Array.isArray(participants)) continue;
            const participant = asRecord(participants[0]);
            if (!participant) continue;

            const championId = participant.championId;
            if (typeof championId !== "number") continue;
            const championKey = championKeyById(championId);
            if (!championKey) continue;

            const win = asRecord(participant.stats)?.win;
            if (typeof win !== "boolean") continue;

            const role = roleFromParticipant(participant);
            if (role === undefined) continue;

            const perf = perfFromGame(game, participant);

            result.push({
                championKey,
                role,
                win,
                timestamp: gameCreation,
                ...(typeof gameId === "number" && Number.isFinite(gameId)
                    ? { gameId }
                    : {}),
                ...(perf ? { perf } : {}),
            });
        } catch {
            continue;
        }
    }
    return result;
}

function fallbackKey(m: PersonalMatch) {
    return `${m.championKey}:${m.role}:${m.timestamp}`;
}

export function mergePersonalMatches(
    existing: PersonalMatch[],
    incoming: PersonalMatch[],
): PersonalMatch[] {
    // Existing entries are kept as they are, except that a stored match
    // without perf gains the perf of an incoming duplicate (so a re-sync
    // enriches old matches). Only incoming matches are checked, against the
    // existing ones and the incoming ones kept so far.
    const merged: PersonalMatch[] = [...existing];
    const indexByGameId = new Map<number, number>();
    const indexesByFallbackKey = new Map<string, number[]>();
    const remember = (match: PersonalMatch, index: number) => {
        if (match.gameId !== undefined && !indexByGameId.has(match.gameId)) {
            indexByGameId.set(match.gameId, index);
        }
        const key = fallbackKey(match);
        const same = indexesByFallbackKey.get(key) ?? [];
        same.push(index);
        indexesByFallbackKey.set(key, same);
    };
    existing.forEach(remember);

    for (const match of incoming) {
        const same = indexesByFallbackKey.get(fallbackKey(match)) ?? [];
        const byId =
            match.gameId !== undefined
                ? indexByGameId.get(match.gameId)
                : undefined;
        const duplicateIndex =
            byId ??
            same.find(
                // Different gameIds are different games; otherwise the
                // composite key decides.
                (i) =>
                    merged[i].gameId === undefined ||
                    match.gameId === undefined,
            );
        if (duplicateIndex !== undefined) {
            if (match.perf && !merged[duplicateIndex].perf) {
                merged[duplicateIndex] = {
                    ...merged[duplicateIndex],
                    perf: match.perf,
                };
            }
            continue;
        }
        remember(match, merged.length);
        merged.push(match);
    }

    return merged.sort((a, b) => b.timestamp - a.timestamp);
}
