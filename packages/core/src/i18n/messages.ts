import { en } from "./en";
import { es } from "./es";

export type MessageKey = keyof typeof en;
export type MessageParams = Record<string, string | number>;

export const DEFAULT_LANGUAGE = "en_US";
export const SPANISH_LANGUAGE = "es_ES";

const catalogs = { en, es } satisfies Record<
    string,
    Record<MessageKey, string>
>;

export type UiLocale = keyof typeof catalogs;

// Only Spanish has a translated UI; every other language (including zh_CN,
// which only changes champion names) shows the English UI.
export function uiLocale(language: string): UiLocale {
    return language === SPANISH_LANGUAGE ? "es" : "en";
}

// Replaces `{name}` placeholders in a single pass. Unknown params stay visible.
export function interpolate(template: string, params?: MessageParams) {
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (match, name: string) =>
        Object.prototype.hasOwnProperty.call(params, name)
            ? String(params[name])
            : match,
    );
}

export function translate(
    language: string,
    key: MessageKey,
    params?: MessageParams,
) {
    return interpolate(catalogs[uiLocale(language)][key], params);
}

// A stored language always wins; otherwise a Spanish browser gets es_ES.
export function defaultLanguage(
    stored: string | undefined,
    navigatorLanguage: string | undefined,
) {
    if (stored) return stored;
    if (navigatorLanguage?.toLowerCase().startsWith("es")) {
        return SPANISH_LANGUAGE;
    }
    return DEFAULT_LANGUAGE;
}

// An explicit (non-empty) choice is never overwritten; unset follows the UI.
export function llmResponseLanguage(configured: string, language: string) {
    if (configured.trim() !== "") return configured;
    return uiLocale(language) === "es" ? "Spanish" : "English";
}
