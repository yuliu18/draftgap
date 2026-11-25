import { Role } from "../models/Role";

export type PersonalMatch = {
    championKey: string;
    role: Role;
    win: boolean;
    timestamp: number;
};

export type PersonalPickStats = {
    championKey: string;
    role: Role;
    games: number;
    wins: number;
    lastPlayed: number;
};

export type PersonalStats = {
    byPick: Record<string, PersonalPickStats>;
    games: number;
    wins: number;
    gamesByRole: Record<Role, number>;
    recent: { games: number; wins: number };
};

export function personalPickKey(championKey: string, role: Role) {
    return `${championKey}:${role}`;
}

export function emptyPersonalStats(): PersonalStats {
    return {
        byPick: {},
        games: 0,
        wins: 0,
        gamesByRole: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 },
        recent: { games: 0, wins: 0 },
    };
}

export function buildPersonalStats(
    matches: PersonalMatch[],
    options?: { recentGames?: number },
): PersonalStats {
    const recentGames = options?.recentGames ?? 20;
    const stats = emptyPersonalStats();

    for (const match of matches) {
        const key = personalPickKey(match.championKey, match.role);
        const pick = (stats.byPick[key] ??= {
            championKey: match.championKey,
            role: match.role,
            games: 0,
            wins: 0,
            lastPlayed: match.timestamp,
        });
        pick.games++;
        if (match.win) pick.wins++;
        pick.lastPlayed = Math.max(pick.lastPlayed, match.timestamp);

        stats.games++;
        if (match.win) stats.wins++;
        stats.gamesByRole[match.role]++;
    }

    const recent = [...matches]
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, Math.max(0, recentGames));
    stats.recent = {
        games: recent.length,
        wins: recent.filter((m) => m.win).length,
    };

    return stats;
}
