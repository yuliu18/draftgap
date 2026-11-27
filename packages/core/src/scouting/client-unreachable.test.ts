import { describe, expect, test } from "bun:test";
import {
    clientNotRunningSnapshot,
    clientTimeoutSnapshot,
    isClientUnreachable,
} from "./client-unreachable";

describe("isClientUnreachable", () => {
    test("client down errors", () => {
        for (const e of [
            "Could not get lcu data: Could not find the League client process",
            "Could not get response: Connection refused",
        ]) {
            expect(isClientUnreachable(e)).toBe(true);
        }
    });

    test("other errors are not", () => {
        for (const e of [
            "LCU returned 500",
            "Could not get response: error sending request",
            "Could not get lcu data: Could not parse port",
            "",
            null,
            undefined,
            42,
            { message: "Could not get response" },
        ]) {
            expect(isClientUnreachable(e)).toBe(false);
        }
    });

    test("timeouts get a distinct reason, not client not running", () => {
        for (const error of [
            new Error("Could not get response: timed out"),
            "Could not read response body: operation timed out",
            "time budget exceeded",
        ]) {
            expect(isClientUnreachable(error)).toBe(false);
            expect(clientTimeoutSnapshot(error)).toEqual({
                status: "not_available",
                phase: "None",
                reason: "client_timeout",
            });
        }
        expect(clientTimeoutSnapshot("LCU returned 500")).toBeUndefined();
        expect(
            clientTimeoutSnapshot("Could not get response: Connection refused"),
        ).toBeUndefined();
    });

    test("typed not-available result", () => {
        expect(clientNotRunningSnapshot()).toEqual({
            status: "not_available",
            phase: "None",
            reason: "client_not_running",
        });
    });
});
