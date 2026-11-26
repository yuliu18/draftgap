import type { ScoutingSnapshot } from "./scouting-snapshot";

// Error prefixes of the Tauri LCU helper when the League client cannot be
// reached (no client process found, or the request never got a response).
const UNREACHABLE_PREFIXES = [
    "Could not get lcu data",
    "Could not get response",
];

export function isClientUnreachable(error: unknown): boolean {
    const message =
        typeof error === "string"
            ? error
            : error instanceof Error
              ? error.message
              : "";
    return UNREACHABLE_PREFIXES.some((p) => message.startsWith(p));
}

/** The typed result for a client that is not running. */
export function clientNotRunningSnapshot(): ScoutingSnapshot {
    return {
        status: "not_available",
        phase: "None",
        reason: "client_not_running",
    };
}
