import { createSignal, onCleanup, onMount } from "solid-js";
import {
    GameStatus,
    inGameId,
    scoutingGameId,
} from "@draftgap/core/src/scouting/match-view";
import { ScoutingSnapshot } from "@draftgap/core/src/scouting/scouting-snapshot";
import { getGameStatus, getScoutingSnapshot } from "../api/scouting-api";
import { getCurrentSummoner } from "../api/lcu-api";

type GameScout = { snapshot?: ScoutingSnapshot; puuid?: string };
const POLL_INTERVAL = 3000;
const attempted = new Set<number>();
// Keep the current game's promise across tab changes, even while in flight.
let cached: { gameId: number; result: Promise<GameScout> } | undefined;

export function createMatchScouting(enabled: boolean) {
    const [status, setStatus] = createSignal<GameStatus | null>();
    const [scout, setScout] = createSignal<{ id: number; data: GameScout }>();
    const [failed, setFailed] = createSignal(false);
    const currentId = () => (status() ? inGameId(status()!) : undefined);
    const current = () =>
        scout()?.id === currentId() ? scout()?.data : undefined;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
        try {
            const next = await getGameStatus();
            if (!active) return;
            setFailed(false);
            setStatus(next);
            const id = currentId();
            if (id === undefined || scout()?.id === id) return;
            const requested = next && scoutingGameId(next, attempted);
            if (requested) {
                attempted.add(requested);
                cached = {
                    gameId: requested,
                    result: Promise.all([
                        getScoutingSnapshot().catch(() => undefined),
                        getCurrentSummoner().catch(() => null),
                    ]).then(([snapshot, summoner]) => {
                        // Gameflow can change between the probe and the snapshot.
                        if (
                            snapshot?.status === "available" &&
                            snapshot.gameId !== requested
                        ) {
                            if (
                                snapshot.gameId !== undefined &&
                                cached?.gameId === requested
                            ) {
                                attempted.add(snapshot.gameId);
                                cached = {
                                    gameId: snapshot.gameId,
                                    result: Promise.resolve({
                                        snapshot,
                                        puuid: summoner?.puuid,
                                    }),
                                };
                            }
                            return {};
                        }
                        return { snapshot, puuid: summoner?.puuid };
                    }),
                };
            }
            if (cached?.gameId === id) {
                const data = await cached.result;
                if (active) setScout({ id, data });
            } else {
                setScout({ id, data: {} });
            }
        } catch {
            if (active) {
                setStatus(undefined);
                setFailed(true);
            }
        } finally {
            if (active) timer = setTimeout(() => void poll(), POLL_INTERVAL);
        }
    }

    onMount(() => {
        if (enabled) void poll();
    });
    onCleanup(() => {
        active = false;
        clearTimeout(timer);
    });
    return { status, current, failed };
}
