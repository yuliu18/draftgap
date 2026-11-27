import { Role } from "../models/Role";
import { PersonalMatch, PersonalPerf } from "./personal-stats";

// Summoner's Rift PvP queues: 400 normal draft, 420 ranked solo/duo,
// 430 blind, 440 ranked flex, 480 swiftplay, 490 quickplay.
export const DEFAULT_PERSONAL_QUEUE_IDS = [
    400, 420, 430, 440, 480, 490,
] as const;

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
            // A real client reports the bottom carry as SOLO, NONE or DUO too.
            if (role === "DUO_SUPPORT" || role === "SUPPORT") {
                return Role.Support;
            }
            return Role.Bottom;
        case "NONE":
            return undefined;
        case "":
            if (timeline?.lane === "") return undefined;
            break;
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

type MapOptions = {
    queueIds?: readonly number[];
    knownMatches?: readonly PersonalMatch[];
};

type MatchCandidate = Omit<PersonalMatch, "role"> & { role?: Role };

export function mapLcuMatchHistory(
    raw: unknown,
    championKeyById: (id: number) => string | undefined,
    options?: MapOptions,
): PersonalMatch[] {
    return mapLcuMatchHistoryWithResult(raw, championKeyById, options).matches;
}

export function mapLcuMatchHistoryWithResult(
    raw: unknown,
    championKeyById: (id: number) => string | undefined,
    options?: MapOptions,
) {
    const queueIds = options?.queueIds ?? DEFAULT_PERSONAL_QUEUE_IDS;
    const games = asRecord(asRecord(raw)?.games)?.games;
    if (!Array.isArray(games)) return { matches: [], skippedUnknownRole: 0 };

    const candidates: MatchCandidate[] = [];
    for (const entry of games) {
        try {
            const game = asRecord(entry);
            if (!game) continue;

            const { queueId, gameCreation, gameId, gameDuration } = game;
            if (typeof queueId !== "number" || !queueIds.includes(queueId)) {
                continue;
            }
            if (finite(gameDuration) && gameDuration < 300) continue;
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

            const hasSmite =
                participant.spell1Id === 11 || participant.spell2Id === 11;
            const role =
                roleFromParticipant(participant) ??
                (hasSmite ? Role.Jungle : undefined);
            const perf = perfFromGame(game, participant);

            candidates.push({
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
    const matches: PersonalMatch[] = [];
    let skippedUnknownRole = 0;
    const preferredRoles = candidates.some((m) => m.role === undefined)
        ? preferredRolesByChampion(candidates, options?.knownMatches ?? [])
        : undefined;
    for (const candidate of candidates) {
        const role =
            candidate.role ?? preferredRoles?.get(candidate.championKey);
        if (role === undefined) {
            skippedUnknownRole++;
            continue;
        }
        matches.push({
            ...candidate,
            role,
            ...(candidate.role === undefined ? { roleInferred: true } : {}),
        });
    }
    return { matches, skippedUnknownRole };
}

function preferredRolesByChampion(
    candidates: MatchCandidate[],
    stored: readonly PersonalMatch[],
) {
    // Freshly read games supersede cached evidence, including old records
    // misclassified as Support by the legacy NONE/SUPPORT mapping.
    const evidence = mergePersonalMatches(
        [],
        [
            ...stored.filter(
                (m) =>
                    !m.roleInferred &&
                    !candidates.some((c) => samePersonalGame(m, c)),
            ),
            ...candidates.filter(
                (m): m is PersonalMatch => m.role !== undefined,
            ),
        ],
    );
    const counts = new Map<
        string,
        Map<Role, { games: number; latest: number }>
    >();
    for (const { championKey, role, timestamp } of evidence) {
        const roles = counts.get(championKey) ?? new Map();
        const previous = roles.get(role);
        roles.set(role, {
            games: (previous?.games ?? 0) + 1,
            latest: Math.max(previous?.latest ?? -Infinity, timestamp),
        });
        counts.set(championKey, roles);
    }
    const preferred = new Map<string, Role>();
    for (const [championKey, roles] of counts) {
        let games = 0;
        let latest = -Infinity;
        for (const [role, vote] of roles) {
            if (
                vote.games > games ||
                (vote.games === games && vote.latest > latest)
            ) {
                preferred.set(championKey, role);
                ({ games, latest } = vote);
            }
        }
    }
    return preferred;
}

export function samePersonalGame(
    a: Pick<PersonalMatch, "gameId" | "championKey" | "timestamp">,
    b: Pick<PersonalMatch, "gameId" | "championKey" | "timestamp">,
) {
    return a.gameId !== undefined && b.gameId !== undefined
        ? a.gameId === b.gameId
        : a.championKey === b.championKey && a.timestamp === b.timestamp;
}

export function mergePersonalMatches(
    existing: PersonalMatch[],
    incoming: PersonalMatch[],
): PersonalMatch[] {
    const merged = [...existing];
    for (const match of incoming) {
        const index = merged.findIndex((m) => samePersonalGame(m, match));
        if (index === -1) {
            const older = merged.findIndex(
                (m) => m.timestamp < match.timestamp,
            );
            merged.splice(older === -1 ? merged.length : older, 0, match);
        } else {
            merged[index] = match;
            // Collapse legacy duplicates only for games that were re-read.
            for (let i = merged.length - 1; i > index; i--) {
                if (samePersonalGame(merged[i], match)) merged.splice(i, 1);
            }
        }
    }
    return merged;
}
