import { ROLES } from "../models/Role";
import { PersonalMatch } from "./personal-stats";

export function serializePersonalMatches(matches: PersonalMatch[]) {
    return JSON.stringify(matches);
}

function toPersonalMatch(value: unknown): PersonalMatch | undefined {
    if (typeof value !== "object" || value === null) return undefined;
    const { championKey, role, win, timestamp, gameId } = value as Record<
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
