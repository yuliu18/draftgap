const MINUS = "−";

export function formatNumber(value: number, decimals = 1, locale?: string) {
    return value.toLocaleString(locale, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    });
}

const isZero = (value: number, decimals: number) =>
    Number(Math.abs(value).toFixed(decimals)) === 0;

/** `+1,8` / `−0,4` / `0,0`: a real minus sign, tabular-friendly. */
export function formatSigned(value: number, decimals = 1, locale?: string) {
    const abs = formatNumber(Math.abs(value), decimals, locale);
    if (isZero(value, decimals)) return abs;
    return `${value < 0 ? MINUS : "+"}${abs}`;
}

/** Colour is only used on signed numbers (green / red). */
export function signClass(value: number | undefined, decimals = 1) {
    if (value === undefined || isZero(value, decimals)) return "";
    return value > 0 ? "text-pg-pos" : "text-pg-neg";
}

/** `fraction` is 0..1. */
export function formatPercent(fraction: number, decimals = 1, locale?: string) {
    return `${formatNumber(fraction * 100, decimals, locale)}${locale ? " " : ""}%`;
}

/** Seconds as `28:40`. */
export function formatDuration(seconds: number) {
    const total = Math.round(seconds);
    const minutes = Math.floor(total / 60);
    return `${minutes}:${String(total % 60).padStart(2, "0")}`;
}
