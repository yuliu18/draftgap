import type { ScoutingSnapshot } from "./scouting-snapshot";

function errorMessage(error: unknown) {
    return typeof error === "string"
        ? error
        : error instanceof Error
          ? error.message
          : "";
}

export function isClientUnreachable(error: unknown): boolean {
    const message = errorMessage(error);
    // A generic send error can also be a timeout; only explicit connection
    // failures or an absent client process imply the client is not running.
    return (
        message ===
            "Could not get lcu data: Could not find the League client process" ||
        /^Could not get response: (?:connection refused|(?:tcp )?connect error)\b/i.test(
            message,
        )
    );
}

export function clientTimeoutSnapshot(
    error: unknown,
): ScoutingSnapshot | undefined {
    const message = errorMessage(error);
    if (
        message !== "time budget exceeded" &&
        !/^Could not (?:get response|read response body): .*\b(?:timed out|timeout)\b/i.test(
            message,
        )
    ) {
        return undefined;
    }
    return { status: "not_available", phase: "None", reason: "client_timeout" };
}

/** The typed result for a client that is not running. */
export function clientNotRunningSnapshot(): ScoutingSnapshot {
    return {
        status: "not_available",
        phase: "None",
        reason: "client_not_running",
    };
}
