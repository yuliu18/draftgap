import { ROLES } from "../models/Role";
import {
    PERF_NUMERIC_FIELDS,
    PersonalMatch,
    PersonalPerf,
} from "./personal-stats";

export function serializePersonalMatches(matches: PersonalMatch[]) {
    return JSON.stringify(matches);
}

function toPerf(value: unknown): PersonalPerf | undefined {
    if (typeof value !== "object" || value === null) return undefined;
    const raw = value as Record<string, unknown>;
    const perf: PersonalPerf = {};
    // Invalid fields are dropped one by one; the match itself stays valid.
    for (const field of PERF_NUMERIC_FIELDS) {
        const v = raw[field];
        if (typeof v === "number" && Number.isFinite(v) && v >= 0) {
            perf[field] = v;
        }
    }
    if (typeof raw.queueId === "number" && Number.isFinite(raw.queueId)) {
        perf.queueId = raw.queueId;
    }
    return Object.keys(perf).length > 0 ? perf : undefined;
}

function toPersonalMatch(value: unknown): PersonalMatch | undefined {
    if (typeof value !== "object" || value === null) return undefined;
    const { championKey, role, win, timestamp, gameId, perf } = value as Record<
        string,
        unknown
    >;

    if (typeof championKey !== "string" || championKey === "") {
        return undefined;
    }
    if (!(ROLES as readonly unknown[]).includes(role)) return undefined;
    if (typeof win !== "boolean") return undefined;
    if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) {
        return undefined;
    }

    return {
        championKey,
        role: role as PersonalMatch["role"],
        win,
        timestamp,
        ...(typeof gameId === "number" && Number.isFinite(gameId)
            ? { gameId }
            : {}),
        ...(toPerf(perf) ? { perf: toPerf(perf) } : {}),
    };
}

export function parsePersonalMatches(
    raw: string | null | undefined,
): PersonalMatch[] {
    if (!raw) return [];

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return [];
    }
    if (!Array.isArray(parsed)) return [];

    return parsed
        .map(toPersonalMatch)
        .filter((m): m is PersonalMatch => m !== undefined);
}
