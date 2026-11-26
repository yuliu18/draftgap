import { Role } from "../models/Role";
import { PersonalMatch } from "./personal-stats";

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

            result.push({
                championKey,
                role,
                win,
                timestamp: gameCreation,
                ...(typeof gameId === "number" && Number.isFinite(gameId)
                    ? { gameId }
                    : {}),
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
    const merged: PersonalMatch[] = [];
    const byFallbackKey = new Map<string, PersonalMatch[]>();

    for (const match of [...existing, ...incoming]) {
        const key = fallbackKey(match);
        const same = byFallbackKey.get(key) ?? [];
        const isDuplicate =
            (match.gameId !== undefined &&
                merged.some((m) => m.gameId === match.gameId)) ||
            same.some(
                // Different gameIds are different games; otherwise the
                // composite key decides.
                (m) => m.gameId === undefined || match.gameId === undefined,
            );
        if (isDuplicate) continue;
        same.push(match);
        byFallbackKey.set(key, same);
        merged.push(match);
    }

    return merged.sort((a, b) => b.timestamp - a.timestamp);
}
