import {
    asRecord,
    DEFAULT_PERSONAL_QUEUE_IDS,
    finite,
    MapOptions,
    MatchCandidate,
    personalPerf,
    resolvePersonalRoles,
    roleFromPosition,
    roleWithSmite,
    samePersonalGame,
} from "./lcu-match-history";
import { PersonalMatch } from "./personal-stats";

const platforms = {
    americas: "AMERICAS NA NA1 BR BR1 LAN LA1 LAS LA2",
    europe: "EUROPE EUW EUW1 EUNE EUN1 TR TR1 RU",
    asia: "ASIA KR JP JP1",
    sea: "SEA OCE OC1 PH2 SG2 TH2 TW2 VN2",
} as const;

export type RiotRegion = keyof typeof platforms;
const regions = new Map(
    (Object.keys(platforms) as RiotRegion[]).flatMap((region) =>
        platforms[region]
            .split(" ")
            .map((platform) => [platform, region] as const),
    ),
);

export function riotRegionForPlatform(platformOrRegion: string) {
    return regions.get(platformOrRegion.toUpperCase());
}

const matchIdPattern = /^[A-Z0-9]{2,6}_([0-9]{1,20})$/;
const puuidPattern = /^[A-Za-z0-9_-]{1,100}$/;
const positions = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];
type ChampionLookup = (id: number) => string | undefined;

function numericGameId(matchId: unknown) {
    const suffix =
        typeof matchId === "string"
            ? matchIdPattern.exec(matchId)?.[1]
            : undefined;
    const id = Number(suffix);
    return Number.isSafeInteger(id) ? id : undefined;
}

function matchCandidate(
    raw: unknown,
    puuid: string,
    championKeyById: ChampionLookup,
    queueIds: readonly number[],
): MatchCandidate | undefined {
    const match = asRecord(raw);
    const info = asRecord(match?.info);
    const gameId = numericGameId(asRecord(match?.metadata)?.matchId);
    if (!info || gameId === undefined) return;
    const {
        queueId,
        gameCreation,
        gameDuration,
        gameEndTimestamp,
        participants,
    } = info;
    if (
        !finite(queueId) ||
        !queueIds.includes(queueId) ||
        !finite(gameCreation) ||
        !Array.isArray(participants)
    )
        return;
    const duration = finite(gameDuration)
        ? gameDuration / (gameEndTimestamp == null ? 1000 : 1)
        : undefined;
    if (duration !== undefined && duration < 300) return;

    const player = asRecord(
        participants.find((p: unknown) => asRecord(p)?.puuid === puuid),
    );
    if (
        !player ||
        !finite(player.championId) ||
        typeof player.win !== "boolean"
    )
        return;
    const championKey = championKeyById(player.championId);
    if (!championKey) return;

    const position = [player.teamPosition, player.individualPosition].find(
        (value): value is string =>
            typeof value === "string" && positions.includes(value),
    );
    const role = roleWithSmite(
        roleFromPosition(position),
        player.summoner1Id,
        player.summoner2Id,
    );
    const perf = personalPerf(player, duration, queueId);
    return {
        championKey,
        role,
        gameId,
        timestamp: gameCreation,
        win: player.win,
        ...(perf ? { perf } : {}),
    };
}

export function mapRiotMatch(
    raw: unknown,
    puuid: string,
    championKeyById: ChampionLookup,
    options?: MapOptions,
) {
    const candidate = matchCandidate(
        raw,
        puuid,
        championKeyById,
        options?.queueIds ?? DEFAULT_PERSONAL_QUEUE_IDS,
    );
    return (
        candidate &&
        resolvePersonalRoles([candidate], options?.knownMatches).matches[0]
    );
}

export type RiotResponse<T> =
    | { kind: "ok"; data: T }
    | { kind: "rateLimited"; retryAfter: number };
type Clock = {
    now: () => number;
    sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
};

// Keep this state across imports to avoid starting a new budget on restart/cancel.
export function createRiotRequestBudget() {
    return { requests: [] as number[], retryAt: -Infinity };
}

type RiotHistoryDeps = Clock & {
    getAccount: (
        gameName: string,
        tagLine: string,
    ) => Promise<RiotResponse<unknown>>;
    getMatchIds: (
        puuid: string,
        start: number,
        count: number,
    ) => Promise<RiotResponse<unknown>>;
    getMatch: (matchId: string) => Promise<RiotResponse<unknown>>;
    championKeyById: ChampionLookup;
    getMatches: () => readonly PersonalMatch[];
    mergeMatches: (incoming: PersonalMatch[]) => void;
    budget?: ReturnType<typeof createRiotRequestBudget>;
};

type RiotHistoryOptions = {
    gameName: string;
    tagLine: string;
    maxGames?: number;
    queueIds?: readonly number[];
    signal?: AbortSignal;
    onProgress?: (progress: { read: number; maxGames: number }) => void;
};

const CANCELLED = Symbol("Riot import cancelled");
const PAGE_SIZE = 100;
export const DEFAULT_RIOT_GAMES = 100;
export const MAX_RIOT_GAMES = 500;

export async function importRiotHistory(
    deps: RiotHistoryDeps,
    options: RiotHistoryOptions,
) {
    const { signal, onProgress } = options;
    const maxGames = finite(options.maxGames)
        ? Math.min(MAX_RIOT_GAMES, Math.max(1, Math.floor(options.maxGames)))
        : DEFAULT_RIOT_GAMES;
    const queueIds = options.queueIds ?? DEFAULT_PERSONAL_QUEUE_IDS;
    const budget = deps.budget ?? createRiotRequestBudget();
    const checkCancelled = () => {
        if (signal?.aborted) throw CANCELLED;
    };

    async function request<T>(fetch: () => Promise<RiotResponse<T>>) {
        for (let retries = 0; ; retries++) {
            while (true) {
                checkCancelled();
                const now = deps.now();
                const requests = budget.requests;
                while (requests.length && requests[0] <= now - 120_000)
                    requests.shift();
                const wait = Math.max(
                    budget.retryAt - now,
                    requests.length >= 90
                        ? requests[requests.length - 90] + 120_000 - now
                        : 0,
                    requests.length >= 15
                        ? requests[requests.length - 15] + 1000 - now
                        : 0,
                );
                if (wait <= 0) {
                    requests.push(now);
                    break;
                }
                await deps.sleep(wait, signal);
            }
            let response;
            try {
                response = await fetch();
            } catch (error) {
                checkCancelled();
                throw error;
            }
            if (response.kind === "ok") return response.data;
            budget.retryAt = Math.max(
                budget.retryAt,
                deps.now() + response.retryAfter * 1000,
            );
            checkCancelled();
            if (retries === 3) throw new Error("Riot API rate limit exceeded");
        }
    }

    let read = 0;
    let imported = 0;
    let skippedUnknownRole = 0;
    onProgress?.({ read, maxGames });
    try {
        const account = await request(() =>
            deps.getAccount(options.gameName, options.tagLine),
        );
        const puuid = asRecord(account)?.puuid;
        if (typeof puuid !== "string" || !puuidPattern.test(puuid))
            throw new Error("Unexpected Riot account response");
        while (read < maxGames) {
            const count = Math.min(PAGE_SIZE, maxGames - read);
            const ids = await request(() =>
                deps.getMatchIds(puuid, read, count),
            );
            if (
                !Array.isArray(ids) ||
                ids.length > count ||
                !ids.every(
                    (id: unknown): id is string =>
                        typeof id === "string" &&
                        numericGameId(id) !== undefined,
                )
            ) {
                throw new Error("Unexpected Riot match IDs response");
            }
            if (!ids.length) break;
            const storedIds = new Set(
                deps.getMatches().map((match) => match.gameId),
            );
            const alreadyStored = ids.every((id) =>
                storedIds.has(numericGameId(id)),
            );
            const candidates: MatchCandidate[] = [];
            try {
                for (const id of ids) {
                    const raw = await request(() => deps.getMatch(id));
                    const candidate = matchCandidate(
                        raw,
                        puuid,
                        deps.championKeyById,
                        queueIds,
                    );
                    if (candidate) candidates.push(candidate);
                    read++;
                    onProgress?.({ read, maxGames });
                }
            } finally {
                const stored = deps.getMatches();
                const { matches, skippedUnknownRole: skipped } =
                    resolvePersonalRoles(candidates, stored);
                const added: PersonalMatch[] = [];
                for (const match of matches) {
                    if (
                        !stored.some((old) => samePersonalGame(old, match)) &&
                        !added.some((old) => samePersonalGame(old, match))
                    )
                        added.push(match);
                }
                if (matches.length) deps.mergeMatches(matches);
                imported += added.length;
                skippedUnknownRole += skipped;
            }
            if (alreadyStored) break;
        }
    } catch (error) {
        if (error !== CANCELLED) throw error;
    }
    return {
        read,
        imported,
        total: deps.getMatches().length,
        skippedUnknownRole,
    };
}
