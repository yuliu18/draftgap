import { ScoutedPlayer, ScoutingSnapshot } from "./scouting-snapshot";

export type GameStatus = { phase: string; gameId: number | null };

export function isInGamePhase(phase: string | undefined) {
    return (
        phase === "GameStart" || phase === "InProgress" || phase === "Reconnect"
    );
}

export function inGameId({ phase, gameId }: GameStatus) {
    return isInGamePhase(phase) &&
        gameId !== null &&
        Number.isSafeInteger(gameId) &&
        gameId > 0
        ? gameId
        : undefined;
}

export function scoutingGameId(
    status: GameStatus,
    attempted: ReadonlySet<number>,
) {
    const id = inGameId(status);
    return id !== undefined && !attempted.has(id) ? id : undefined;
}

export function selectMatchup(
    snapshot: ScoutingSnapshot | undefined,
    puuid: string | undefined,
): { me?: ScoutedPlayer; opponent?: ScoutedPlayer } {
    if (snapshot?.status !== "available" || !puuid) return {};
    const me = snapshot.players.find((p) => !p.isBot && p.puuid === puuid);
    if (!me || me.role === undefined) return me ? { me } : {};
    const opponents = snapshot.players.filter(
        (p) => p.team !== me.team && p.role === me.role,
    );
    return { me, opponent: opponents.length === 1 ? opponents[0] : undefined };
}
