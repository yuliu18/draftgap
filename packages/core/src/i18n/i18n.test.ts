import { describe, expect, test } from "bun:test";
import { en } from "./en";
import { es } from "./es";
import {
    defaultLanguage,
    interpolate,
    llmResponseLanguage,
    translate,
    uiLocale,
} from "./messages";

describe("catalogs", () => {
    test("Spanish has exactly the English key set", () => {
        expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
    });

    test("no catalog value is empty", () => {
        for (const catalog of [en, es]) {
            for (const [key, value] of Object.entries(catalog)) {
                expect(value.trim() === "" ? key : "").toBe("");
            }
        }
    });

    test("Spanish only uses {params} that English also receives", () => {
        const params = (s: string) => s.match(/\{\w+\}/g) ?? [];
        for (const key of Object.keys(en) as (keyof typeof en)[]) {
            const allowed = new Set(params(en[key]));
            const unknown = params(es[key]).filter((p) => !allowed.has(p));
            expect([key, unknown]).toEqual([key, []]);
        }
    });
});

describe("interpolate", () => {
    test("replaces {name} params", () => {
        expect(
            interpolate("Hola {name}, {n} partidas", { name: "Ana", n: 3 }),
        ).toBe("Hola Ana, 3 partidas");
    });

    test("replaces every occurrence of a param", () => {
        expect(interpolate("{a}-{a}", { a: "x" })).toBe("x-x");
    });

    test("leaves unknown params visible", () => {
        expect(interpolate("Hola {name} {other}", { name: "Ana" })).toBe(
            "Hola Ana {other}",
        );
        expect(interpolate("Hola {name}")).toBe("Hola {name}");
    });

    test("does not reinterpret replaced values", () => {
        expect(interpolate("{a}", { a: "{b}", b: "x" })).toBe("{b}");
    });
});

describe("translate", () => {
    test("uses Spanish for es_ES", () => {
        expect(translate("es_ES", "settings.title")).toBe(es["settings.title"]);
    });

    test("uses English for en_US and zh_CN", () => {
        expect(translate("en_US", "settings.title")).toBe(en["settings.title"]);
        expect(translate("zh_CN", "settings.title")).toBe(en["settings.title"]);
    });
});

describe("uiLocale", () => {
    test("only es_ES switches the UI to Spanish", () => {
        expect(uiLocale("es_ES")).toBe("es");
        expect(uiLocale("en_US")).toBe("en");
        expect(uiLocale("zh_CN")).toBe("en");
        expect(uiLocale("fr_FR")).toBe("en");
    });
});

describe("defaultLanguage", () => {
    test("a stored value always wins", () => {
        expect(defaultLanguage("en_US", "es-ES")).toBe("en_US");
        expect(defaultLanguage("zh_CN", "es-MX")).toBe("zh_CN");
    });

    test("an es locale picks es_ES", () => {
        expect(defaultLanguage(undefined, "es-ES")).toBe("es_ES");
        expect(defaultLanguage(undefined, "es")).toBe("es_ES");
        expect(defaultLanguage(undefined, "ES-mx")).toBe("es_ES");
    });

    test("otherwise the previous default", () => {
        expect(defaultLanguage(undefined, "en-US")).toBe("en_US");
        expect(defaultLanguage(undefined, "zh-CN")).toBe("en_US");
        expect(defaultLanguage(undefined, undefined)).toBe("en_US");
        expect(defaultLanguage("", "fr")).toBe("en_US");
    });
});

describe("llmResponseLanguage", () => {
    test("an explicit choice is never overwritten", () => {
        expect(llmResponseLanguage("French", "es_ES")).toBe("French");
        expect(llmResponseLanguage("English", "es_ES")).toBe("English");
    });

    test("unset follows the UI language", () => {
        expect(llmResponseLanguage("", "es_ES")).toBe("Spanish");
        expect(llmResponseLanguage("  ", "es_ES")).toBe("Spanish");
        expect(llmResponseLanguage("", "en_US")).toBe("English");
        expect(llmResponseLanguage("", "zh_CN")).toBe("English");
    });
});
