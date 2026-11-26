import { MessageKey, MessageParams } from "../i18n/messages";

/** Maps the error a client import command rejected with to its message key. */
export function importErrorKey(error: unknown): MessageKey {
    const code = String(error).split(":")[0].trim();
    switch (code) {
        case "page_limit":
            return "build.import.error.pageLimit";
        case "client_not_running":
            return "build.import.error.notRunning";
        case "unexpected_response":
            return "build.import.error.unexpected";
        case "invalid_input":
            return "build.import.error.invalid";
        default:
            return "build.import.error.generic";
    }
}

/**
 * Failure text: the reason, then what was actually written before it failed
 * (`written` holds the already translated names of the written parts).
 */
export function importFailureMessage(
    t: (key: MessageKey, params?: MessageParams) => string,
    error: unknown,
    written: string[],
) {
    const outcome =
        written.length > 0
            ? t("build.import.partial", { written: written.join(", ") })
            : t("build.import.nothingWritten");
    return `${t(importErrorKey(error))} ${outcome}`;
}
