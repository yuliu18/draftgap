import type { ScoutingSnapshot } from "./scouting-snapshot";

function errorMessage(error: unknown) {
    return typeof error === "string"
        ? error
        : error instanceof Error
          ? error.message
          : "";
}

const isTimeout = (message: string) =>
    /\b(?:timed out|timeout)\b/i.test(message);

export function isClientUnreachable(error: unknown): boolean {
    const message = errorMessage(error);
    // The request library prints a refused local port as a generic send
    // error, so any failed request counts as a client that is not running
    // unless the message says it timed out.
    return (
        message ===
            "Could not get lcu data: Could not find the League client process" ||
        (message.startsWith("Could not get response: ") && !isTimeout(message))
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
