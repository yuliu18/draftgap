import { createSignal, onCleanup, onMount } from "solid-js";
import {
    GameStatus,
    inGameId,
    nextScoutingAttempt,
    ScoutingAttempt,
} from "@draftgap/core/src/scouting/match-view";
import { ScoutingSnapshot } from "@draftgap/core/src/scouting/scouting-snapshot";
import { getGameStatus, getScoutingSnapshot } from "../api/scouting-api";
import { getCurrentSummoner } from "../api/lcu-api";

type GameScout = { snapshot?: ScoutingSnapshot; puuid?: string };
const POLL_INTERVAL = 3000;
type ScoutEntry = {
    attempt: ScoutingAttempt;
    data?: GameScout;
    pending?: Promise<void>;
};
// Share the retry budget, cached results and pending work across tab changes.
const games = new Map<number, ScoutEntry>();

async function fetchScout(
    id: number,
    previous?: GameScout,
): Promise<GameScout> {
    const [snapshot, puuid] = await Promise.all([
        previous?.snapshot?.status === "available"
            ? previous.snapshot
            : getScoutingSnapshot().catch(() => undefined),
        previous?.puuid ||
            getCurrentSummoner()
                .then((summoner) => summoner?.puuid)
                .catch(() => undefined),
    ]);
    // The game can change between the status probe and the snapshot.
    return {
        snapshot:
            snapshot?.status === "available" && snapshot.gameId !== id
                ? undefined
                : snapshot,
        puuid,
    };
}

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
            const id = next && inGameId(next);
            if (!next || id == null) return;
            let entry = games.get(id);
            const data = entry?.data;
            if (
                !entry?.pending &&
                !(data?.snapshot?.status === "available" && data.puuid)
            ) {
                const attempt = nextScoutingAttempt(
                    next,
                    entry?.attempt,
                    performance.now(),
                );
                if (attempt) {
                    const started: ScoutEntry = { attempt, data };
                    games.set(id, started);
                    started.pending = fetchScout(id, data).then((result) => {
                        started.data = result;
                        started.pending = undefined;
                    });
                    entry = started;
                }
            }
            await entry?.pending;
            if (
                active &&
                entry?.data &&
                (scout()?.id !== id || scout()?.data !== entry.data)
            ) {
                setScout({ id, data: entry.data });
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
