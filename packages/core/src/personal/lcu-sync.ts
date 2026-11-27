import {
    DEFAULT_PERSONAL_QUEUE_IDS,
    mapLcuMatchHistoryWithResult,
    mergePersonalMatches,
    samePersonalGame,
} from "./lcu-match-history";
import { PersonalMatch } from "./personal-stats";

const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_MAX_GAMES = 200;

function rawGames(page: unknown) {
    const games = (page as any)?.games?.games;
    if (!Array.isArray(games)) {
        // The LCU is undocumented: fail loudly instead of reporting an empty
        // history when its shape changes.
        throw new Error(
            `unexpected match history response: ${JSON.stringify(page)?.slice(0, 200)}`,
        );
    }
    return games as unknown[];
}

const perfCount = (matches: PersonalMatch[]) =>
    matches.filter((m) => m.perf !== undefined).length;

function gameIdSignature(games: unknown[]) {
    const ids = games.map((g) => (g as any)?.gameId);
    return ids.some((id) => typeof id === "number")
        ? JSON.stringify(ids)
        : undefined;
}

/**
 * Pages through the client's match history and merges it into `existing`.
 * Stops on a missing or empty page, when a page has importable games but all
 * are already known and unchanged, or when a page repeats the previous one.
 * Rejects a pageSize that is not a positive integer.
 */
export async function walkMatchHistory(
    fetchPage: (begIndex: number, endIndex: number) => Promise<unknown>,
    existing: PersonalMatch[],
    championKeyById: (id: number) => string | undefined,
    options?: {
        pageSize?: number;
        maxGames?: number;
        queueIds?: readonly number[];
    },
) {
    const pageSize = options?.pageSize ?? DEFAULT_PAGE_SIZE;
    if (!Number.isInteger(pageSize) || pageSize <= 0) {
        throw new RangeError("pageSize must be a positive integer");
    }
    const maxGames = options?.maxGames ?? DEFAULT_MAX_GAMES;
    const queueIds = options?.queueIds ?? DEFAULT_PERSONAL_QUEUE_IDS;

    let merged = existing;
    let imported = 0;
    let read = 0;
    let skippedUnknownRole = 0;
    let previousSignature: string | undefined;

    for (let beg = 0; beg < maxGames; beg += pageSize) {
        const page = await fetchPage(beg, beg + pageSize - 1);
        if (page === null || page === undefined) break;

        const games = rawGames(page);
        if (games.length === 0) break;
        const signature = gameIdSignature(games);
        if (signature !== undefined && signature === previousSignature) break;
        previousSignature = signature;

        const { matches: incoming, skippedUnknownRole: skipped } =
            mapLcuMatchHistoryWithResult(page, championKeyById, {
                queueIds,
                knownMatches: merged,
            });
        const before = merged;
        const next = mergePersonalMatches(before, incoming);
        const fresh = new Set(incoming);
        const added = next.filter(
            (m) =>
                fresh.has(m) && !before.some((old) => samePersonalGame(old, m)),
        ).length;
        read += games.length;
        skippedUnknownRole += skipped;
        merged = next;
        imported += added;
        // Continue after correcting roles or enriching older records.
        const corrected = incoming.some((m) =>
            before.some(
                (old) =>
                    samePersonalGame(old, m) &&
                    (m.role !== old.role ||
                        m.roleInferred !== old.roleInferred),
            ),
        );
        const enriched = perfCount(next) > perfCount(before);
        if (incoming.length > 0 && added === 0 && !corrected && !enriched)
            break;
    }

    return { matches: merged, imported, read, skippedUnknownRole };
}
