import type { Dataset } from "../models/dataset/Dataset";
import type { Role } from "../models/Role";
import { getStats } from "../draft/utils";
import { ChampionKit, formatChampionKit } from "./champion-kit";
import type { RankInfo, ScoutedPlayer } from "../scouting/scouting-snapshot";

export type MatchupPhase = "champ-select" | "in-game";

export type RecordStats = { games: number; wins: number };

export type MatchupSide = {
    championName: string;
    /** Display name of the role, e.g. "Middle". */
    role: string;
    kit?: ChampionKit;
    /** Overall record of the champion in this role (app dataset). */
    overall?: RecordStats;
};

type MatchupScoutedPlayer = {
    team: "ally" | "enemy";
    laneOpponent?: boolean;
    championName: string;
    solo:
        | Pick<
              Extract<RankInfo, { status: "ranked" }>,
              "status" | "tier" | "division" | "leaguePoints"
          >
        | Exclude<RankInfo, { status: "ranked" }>;
    recent?: RecordStats & { kda?: number; topChampions: readonly string[] };
};

export type MatchupChatInput = {
    phase: MatchupPhase;
    me: MatchupSide;
    opponent: MatchupSide;
    /** Wins are from the player's champion perspective. */
    matchup?: RecordStats;
    player?: {
        games: number;
        wins: number;
        kda?: number;
        csPerMin?: number;
    };
    others?: {
        allies: { championName: string; role: string }[];
        enemies: { championName: string; role: string }[];
    };
    /** Anonymous, in-game scouting data; never rendered in champ select. */
    players?: readonly MatchupScoutedPlayer[];
    responseLanguage: string;
};

export type ChatMessage = {
    role: "system" | "user" | "assistant";
    content: string;
};
export type ChatTurn = { role: "user" | "assistant"; content: string };

export const DEFAULT_MAX_TURNS = 12;
export const DEFAULT_MAX_CHARS = 6000;

const pct = (wins: number, games: number) =>
    `${((wins / games) * 100).toFixed(1)}%`;

const side = (s: MatchupSide) => `${s.championName} (${s.role})`;

const overall = (s: MatchupSide) =>
    s.overall && s.overall.games > 0
        ? `${s.championName} in ${s.role}: ${pct(s.overall.wins, s.overall.games)} in ${s.overall.games} games`
        : `${s.championName} in ${s.role}: not available`;

const picks = (list: { championName: string; role: string }[]) =>
    list.map((p) => `${p.championName} (${p.role})`).join(", ") || "none";

const overallOf = ({ wins, games }: RecordStats) => ({ wins, games });

/** Reads the matchup and overall numbers through the draft helper `getStats`. */
export function matchupStatsFor(
    dataset: Dataset,
    myChampionKey: string,
    myRole: Role,
    opponentChampionKey: string,
    opponentRole: Role,
) {
    return {
        matchup: getStats(
            dataset,
            myChampionKey,
            myRole,
            "matchup",
            opponentRole,
            opponentChampionKey,
        ),
        mine: overallOf(getStats(dataset, myChampionKey, myRole)),
        theirs: overallOf(getStats(dataset, opponentChampionKey, opponentRole)),
    };
}

/**
 * The only path from scouted players to the chat: copies rank and recent
 * statistics and nothing that identifies a player.
 */
export function scoutedPlayersForChat(
    players: readonly ScoutedPlayer[],
    me: ScoutedPlayer,
    opponent: ScoutedPlayer | undefined,
    championName: (championId?: number) => string,
): MatchupScoutedPlayer[] {
    return players.map((player) => ({
        team: player.team === me.team ? "ally" : "enemy",
        laneOpponent: player === opponent,
        championName: championName(player.championId),
        solo: player.solo,
        recent: player.recent && {
            games: player.recent.games,
            wins: player.recent.wins,
            kda: player.recent.kda,
            topChampions: player.recent.topChampions.map(({ championId }) =>
                championName(championId),
            ),
        },
    }));
}

const shortLabel = (label: string) =>
    label.replace(/\s+/g, " ").trim().slice(0, 40);

function scoutingSection(players: readonly MatchupScoutedPlayer[]) {
    const laneOpponent = players.find((player) => player.laneOpponent);
    const ordered = laneOpponent
        ? [laneOpponent, ...players.filter((player) => player !== laneOpponent)]
        : players;
    return [
        "Players (scouting):",
        ...ordered
            .slice(0, 10)
            .map(({ team, laneOpponent, championName, solo, recent }) => {
                const side = team === "ally" ? "Ally" : "Enemy";
                const rank =
                    solo.status === "ranked"
                        ? [
                              shortLabel(solo.tier),
                              solo.division && shortLabel(solo.division),
                              solo.leaguePoints !== undefined
                                  ? `${solo.leaguePoints} LP`
                                  : undefined,
                          ]
                              .filter(Boolean)
                              .join(" ")
                        : solo.status;
                const record =
                    recent && recent.games > 0
                        ? `${recent.wins}W-${recent.games - recent.wins}L in ${recent.games} games (${pct(recent.wins, recent.games)})`
                        : "unavailable";
                const kda =
                    recent?.kda === undefined
                        ? ""
                        : `, KDA ${recent.kda.toFixed(1)}`;
                const mains = recent?.topChampions
                    .slice(0, 3)
                    .map(shortLabel)
                    .join(", ");
                const line = `- ${side}${laneOpponent ? " (lane opponent)" : ""}: ${shortLabel(championName)} | Solo: ${rank} | Recent: ${record}${kda}${mains ? ` | Mains: ${mains}` : ""}`;
                return line.slice(0, 180);
            }),
    ];
}

export function buildMatchupContext(input: MatchupChatInput): ChatMessage {
    const { me, opponent } = input;
    const players =
        input.phase === "in-game" && input.players?.length
            ? input.players
            : undefined;
    const lines = [
        "You are a League of Legends lane coach inside a draft tool. The tool supplies live data below; it is the only source of facts about the current patch.",
        "",
        "How to answer:",
        "- Coach how to play this lane: a level 1-3 plan, power spikes, trading patterns, what to avoid, wave and jungle considerations, and item adaptations as options.",
        "- Use only the numbers supplied here for any statistic. Do not invent win rates, patch changes or numbers; if a figure is not supplied, say it is not available.",
        "- Say when something is uncertain instead of guessing.",
        "- Present options with their trade-offs, never a single command; the player decides.",
        ...(players
            ? [
                  "- Use scouting to judge enemy threats and which allies to play around. State when a sample is small.",
              ]
            : []),
        "- Never claim knowledge of hidden information (enemy summoner spells, cooldowns, jungle position, items) that is not listed here.",
        "- Keep answers concise, about 200 words, unless the player asks for more.",
        `- Answer in ${input.responseLanguage}.`,
        "",
        `Phase: ${input.phase}.`,
        input.phase === "champ-select"
            ? "Champ select: the lane opponent is known, other picks may still change."
            : "In game: all ten champions are known.",
        "",
        `Player's champion: ${side(me)}`,
        `Lane opponent: ${side(opponent)}`,
        "",
        "Statistics from the app dataset:",
    ];
    if (input.matchup && input.matchup.games > 0) {
        lines.push(
            `- Matchup ${me.championName} vs ${opponent.championName}: ${pct(input.matchup.wins, input.matchup.games)} win rate in ${input.matchup.games} games (for ${me.championName})`,
        );
    } else {
        lines.push("- Matchup statistics: not available");
    }
    lines.push(`- Overall win rate, ${overall(me)}`);
    lines.push(`- Overall win rate, ${overall(opponent)}`);

    lines.push("", "Player's own record:");
    if (input.player && input.player.games > 0) {
        const p = input.player;
        const parts = [
            `${p.games} games, ${p.wins} wins (${pct(p.wins, p.games)})`,
        ];
        if (p.kda !== undefined) parts.push(`KDA ${p.kda.toFixed(1)}`);
        if (p.csPerMin !== undefined)
            parts.push(`CS/min ${p.csPerMin.toFixed(1)}`);
        lines.push(`- On ${me.championName}: ${parts.join(", ")}`);
    } else {
        lines.push(`- On ${me.championName}: no personal record`);
    }

    if (input.phase === "in-game" && input.others) {
        lines.push(
            "",
            "Other champions in the game:",
            `Allies: ${picks(input.others.allies)}`,
            `Enemies: ${picks(input.others.enemies)}`,
        );
    }

    if (players) lines.push("", ...scoutingSection(players));

    lines.push("", `Kit of ${me.championName} (player):`);
    lines.push(me.kit ? formatChampionKit(me.kit) : "Kit data not available.");
    lines.push("", `Kit of ${opponent.championName} (opponent):`);
    lines.push(
        opponent.kit
            ? formatChampionKit(opponent.kit)
            : "Kit data not available.",
    );

    return { role: "system", content: lines.join("\n") };
}

export function appendTurn(
    history: readonly ChatTurn[],
    role: ChatTurn["role"],
    content: string,
): readonly ChatTurn[] {
    const trimmed = content.trim();
    if (trimmed === "") return history;
    return [...history, { role, content: trimmed }];
}

/**
 * System message first, then the newest turns within `maxTurns` messages and
 * `maxChars` characters. The latest user message is always kept (even over
 * budget) and the kept history never starts with an assistant message.
 */
export function toChatMessages(
    context: ChatMessage,
    history: readonly ChatTurn[],
    maxTurns = DEFAULT_MAX_TURNS,
    maxChars = DEFAULT_MAX_CHARS,
): ChatMessage[] {
    let latestUser = -1;
    for (let i = history.length - 1; i >= 0; i--) {
        if (history[i].role === "user") {
            latestUser = i;
            break;
        }
    }

    let start = history.length;
    let chars = 0;
    for (let i = history.length - 1; i >= 0; i--) {
        const required = i >= latestUser && latestUser !== -1;
        const size = history[i].content.length;
        const kept = history.length - i;
        if (!required && (kept > maxTurns || chars + size > maxChars)) break;
        chars += size;
        start = i;
    }
    while (
        start < latestUser &&
        start < history.length &&
        history[start].role === "assistant"
    ) {
        start++;
    }

    return [context, ...history.slice(start)];
}

/** Message keys only; the UI adds the texts to its catalogs. */
export function suggestedQuestions(phase: MatchupPhase) {
    return phase === "champ-select"
        ? [
              "matchupChat.q.plan",
              "matchupChat.q.spikes",
              "matchupChat.q.avoid",
              "matchupChat.q.items",
          ]
        : [
              "matchupChat.q.plan",
              "matchupChat.q.trade",
              "matchupChat.q.jungle",
              "matchupChat.q.teamfight",
          ];
}
