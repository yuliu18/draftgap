import { invoke } from "@tauri-apps/api/core";
import {
    clientNotRunningSnapshot,
    isClientUnreachable,
} from "@draftgap/core/src/scouting/client-unreachable";
import {
    mapScoutingSnapshot,
    ScoutingSnapshot,
} from "@draftgap/core/src/scouting/scouting-snapshot";

// Read-only (GET) scouting of the ten players of the current game (S16).
// The Rust command refuses every phase except GameStart, InProgress and
// Reconnect, so nothing is looked up during champ select; the result is then
// { status: "not_available" }. A client that is not running resolves to
// { status: "not_available", reason: "client_not_running" }; other errors reject.
export async function getScoutingSnapshot(): Promise<ScoutingSnapshot> {
    try {
        return mapScoutingSnapshot(await invoke("get_scouting_snapshot"));
    } catch (e) {
        if (isClientUnreachable(e)) return clientNotRunningSnapshot();
        throw e;
    }
}
