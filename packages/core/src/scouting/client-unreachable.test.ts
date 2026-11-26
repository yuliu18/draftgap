import { describe, expect, test } from "bun:test";
import {
    clientNotRunningSnapshot,
    isClientUnreachable,
} from "./client-unreachable";

describe("isClientUnreachable", () => {
    test("client down errors", () => {
        for (const e of [
            "Could not get lcu data: Could not find the League client process",
            "Could not get response: error sending request",
            new Error("Could not get response: timed out"),
        ]) {
            expect(isClientUnreachable(e)).toBe(true);
        }
    });

    test("other errors are not", () => {
        for (const e of [
            "LCU returned 500",
            "time budget exceeded",
            "",
            null,
            undefined,
            42,
            { message: "Could not get response" },
        ]) {
            expect(isClientUnreachable(e)).toBe(false);
        }
    });

    test("typed not-available result", () => {
        expect(clientNotRunningSnapshot()).toEqual({
            status: "not_available",
            phase: "None",
            reason: "client_not_running",
        });
    });
});
