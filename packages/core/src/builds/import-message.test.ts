import { describe, expect, test } from "bun:test";
import { translate } from "../i18n/messages";
import { importErrorKey, importFailureMessage } from "./import-message";

const t = (
    key: Parameters<typeof translate>[1],
    params?: Record<string, string>,
) => translate("en_US", key, params);

describe("importErrorKey", () => {
    test("maps each code to its message key", () => {
        expect(importErrorKey("page_limit")).toBe(
            "build.import.error.pageLimit",
        );
        expect(importErrorKey("client_not_running")).toBe(
            "build.import.error.notRunning",
        );
        expect(importErrorKey("unexpected_response: item sets")).toBe(
            "build.import.error.unexpected",
        );
        expect(importErrorKey("invalid_input: item id")).toBe(
            "build.import.error.invalid",
        );
        expect(importErrorKey("client_error: 400 Bad")).toBe(
            "build.import.error.generic",
        );
        expect(importErrorKey(new Error("boom"))).toBe(
            "build.import.error.generic",
        );
        expect(importErrorKey("")).toBe("build.import.error.generic");
    });
});

describe("importFailureMessage", () => {
    test("nothing written says so", () => {
        expect(importFailureMessage(t, "page_limit", [])).toBe(
            `${t("build.import.error.pageLimit")} ${t("build.import.nothingWritten")}`,
        );
    });

    test("rune page written, then the item set fails: no 'nothing was written'", () => {
        const msg = importFailureMessage(t, "unexpected_response: item sets", [
            "rune page",
        ]);
        expect(msg).toBe(
            `${t("build.import.error.unexpected")} ${t("build.import.partial", { written: "rune page" })}`,
        );
        expect(msg.toLowerCase()).not.toContain("nothing was written");
        expect(msg).toContain("Already written: rune page.");
    });

    test("items-only import that fails writes nothing", () => {
        const msg = importFailureMessage(t, "client_error: 500", []);
        expect(msg).toContain(t("build.import.nothingWritten"));
    });

    test("no reason text claims that nothing was written", () => {
        for (const key of [
            "build.import.error.unexpected",
            "build.import.error.invalid",
        ] as const) {
            expect(t(key).toLowerCase()).not.toContain("nothing");
            expect(translate("es_ES", key).toLowerCase()).not.toContain("nada");
        }
    });
});
