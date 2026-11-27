import { describe, expect, test } from "bun:test";
import { walkMatchHistory } from "./lcu-sync";
import { PersonalMatch } from "./personal-stats";
import { Role } from "../models/Role";

const keyOf = (id: number) => (id === 999 ? undefined : String(id));

function game(gameId: number, over: Record<string, unknown> = {}) {
    return {
        gameId,
        queueId: 420,
        gameCreation: 1700000000000 + gameId,
        participants: [
            {
                championId: 103,
                stats: { win: true },
                timeline: { lane: "MIDDLE", role: "SOLO" },
            },
        ],
        ...over,
    };
}
const page = (...games: unknown[]) => ({ games: { games } });

function fake(pages: unknown[]) {
    const calls: [number, number][] = [];
    const fetchPage = async (beg: number, end: number) => {
        calls.push([beg, end]);
        return pages[calls.length - 1];
    };
    return { calls, fetchPage };
}

const ids = (matches: PersonalMatch[]) => matches.map((m) => m.gameId);

describe("walkMatchHistory", () => {
    test("walks windows of pageSize up to maxGames", async () => {
        const f = fake([
            page(game(1)),
            page(game(2)),
            page(game(3)),
            page(game(4)),
        ]);
        const out = await walkMatchHistory(f.fetchPage, [], keyOf, {
            pageSize: 20,
            maxGames: 60,
        });
        expect(f.calls).toEqual([
            [0, 19],
            [20, 39],
            [40, 59],
        ]);
        expect(out.imported).toBe(3);
        expect(out.read).toBe(3);
        expect(ids(out.matches)).toEqual([3, 2, 1]);
    });

    test.each([0, -1, 1.5, NaN, Infinity])(
        "rejects invalid pageSize %p before fetching",
        async (pageSize) => {
            const f = fake([page(game(1)), null]);
            const existing: PersonalMatch[] = [];
            await expect(
                walkMatchHistory(f.fetchPage, existing, keyOf, { pageSize }),
            ).rejects.toThrow("pageSize must be a positive integer");
            expect(f.calls).toEqual([]);
            expect(existing).toEqual([]);
        },
    );

    test("defaults to 20 per page and 200 games", async () => {
        let n = 0;
        const calls: number[] = [];
        await walkMatchHistory(
            async (beg) => {
                calls.push(beg);
                return page(game(++n));
            },
            [],
            keyOf,
        );
        expect(calls).toHaveLength(10);
        expect(calls[0]).toBe(0);
        expect(calls[9]).toBe(180);
    });

    test("stops on a null or undefined page", async () => {
        for (const end of [null, undefined]) {
            const f = fake([page(game(1)), end, page(game(2))]);
            const out = await walkMatchHistory(f.fetchPage, [], keyOf);
            expect(f.calls).toHaveLength(2);
            expect(ids(out.matches)).toEqual([1]);
        }
    });

    test("stops on an empty games array", async () => {
        const f = fake([page(game(1)), page(), page(game(2))]);
        const out = await walkMatchHistory(f.fetchPage, [], keyOf);
        expect(f.calls).toHaveLength(2);
        expect(out.read).toBe(1);
    });

    test("stops on a page of already known games", async () => {
        const existing: PersonalMatch[] = [
            {
                championKey: "103",
                role: Role.Middle,
                win: true,
                timestamp: 1,
                gameId: 1,
            },
        ];
        const f = fake([page(game(1)), page(game(2))]);
        const out = await walkMatchHistory(f.fetchPage, existing, keyOf);
        expect(f.calls).toHaveLength(1);
        expect(out.imported).toBe(0);
        expect(out.matches).toHaveLength(1);
    });

    test("a page whose games are all filtered out does not stop the walk", async () => {
        const f = fake([page(game(1, { queueId: 450 })), page(game(2)), null]);
        const out = await walkMatchHistory(f.fetchPage, [], keyOf);
        expect(f.calls).toHaveLength(3);
        expect(out.read).toBe(2);
        expect(out.imported).toBe(1);
    });

    test("honors custom queueIds", async () => {
        const f = fake([page(game(1, { queueId: 450 })), null]);
        const out = await walkMatchHistory(f.fetchPage, [], keyOf, {
            queueIds: [450],
        });
        expect(ids(out.matches)).toEqual([1]);
    });

    test("a response without a games array throws", async () => {
        const f = fake([page(game(1)), { games: {} }]);
        const existing: PersonalMatch[] = [];
        const err = await walkMatchHistory(f.fetchPage, existing, keyOf).catch(
            (e) => e,
        );
        expect(err).toBeInstanceOf(Error);
        expect(
            (err as Error).message.startsWith(
                "unexpected match history response",
            ),
        ).toBe(true);
        expect(existing).toEqual([]);
    });

    test("errors from fetchPage propagate", async () => {
        const boom = new Error("lcu down");
        const err = await walkMatchHistory(
            async () => {
                throw boom;
            },
            [],
            keyOf,
        ).catch((e) => e);
        expect(err).toBe(boom);
    });

    test("does not mutate existing", async () => {
        const existing: PersonalMatch[] = [
            { championKey: "5", role: Role.Top, win: false, timestamp: 1 },
        ];
        const before = JSON.stringify(existing);
        const f = fake([page(game(1)), null]);
        const out = await walkMatchHistory(f.fetchPage, existing, keyOf);
        expect(JSON.stringify(existing)).toBe(before);
        expect(out.matches).toHaveLength(2);
    });

    test("stops when a page repeats the previous page's gameIds", async () => {
        const f = fake([
            page(game(1), game(2)),
            page(game(1), game(2)),
            page(game(3)),
        ]);
        const out = await walkMatchHistory(f.fetchPage, [], keyOf);
        expect(f.calls).toHaveLength(2);
        expect(out.read).toBe(2);
        expect(out.imported).toBe(2);
    });

    test("a repeated page of filtered-out games also stops", async () => {
        const f = fake([
            page(game(1, { queueId: 450 })),
            page(game(1, { queueId: 450 })),
            page(game(3)),
        ]);
        await walkMatchHistory(f.fetchPage, [], keyOf);
        expect(f.calls).toHaveLength(2);
    });
});
