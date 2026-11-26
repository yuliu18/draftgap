import { invoke } from "@tauri-apps/api/core";
import {
    mapScoutingSnapshot,
    ScoutingSnapshot,
} from "@draftgap/core/src/scouting/scouting-snapshot";

// Read-only (GET) scouting of the ten players of the current game (S16).
// The Rust command refuses every phase except GameStart, InProgress and
// Reconnect, so nothing is looked up during champ select; the result is then
// { status: "not_available" }.
export async function getScoutingSnapshot(): Promise<ScoutingSnapshot> {
    return mapScoutingSnapshot(await invoke("get_scouting_snapshot"));
}
