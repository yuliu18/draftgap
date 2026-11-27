import { expect, test } from "bun:test";
import fixture from "./__fixtures__/lolalytics-ahri-gold.json";
import {
    extractLolalyticsBaseline,
    lolalyticsBaselineUrl,
    lolalyticsTier,
} from "./lolalytics-page";

const html = `<script type="qwik/json">${JSON.stringify(fixture)}</script>`;

test("maps each ranked LCU tier to the exact Lolalytics tier", () => {
    const tiers = [
        "iron",
        "bronze",
        "silver",
        "gold",
        "platinum",
        "emerald",
        "diamond",
        "master",
        "grandmaster",
        "challenger",
    ];
    expect<unknown>(
        tiers.map((tier) => lolalyticsTier(tier.toUpperCase())),
    ).toEqual(tiers);
    expect(lolalyticsTier("UNRANKED")).toBeUndefined();
});

test("requests only the exact tier for the champion", () => {
    expect(lolalyticsBaselineUrl("MonkeyKing", "gold")).toBe(
        "https://lolalytics.com/lol/wukong/build/?tier=gold",
    );
});

test("extracts champion winrate as a fraction and games from the tier header", () => {
    const baseline = extractLolalyticsBaseline(html, "gold");
    expect(baseline).toMatchObject({ tier: "gold", games: 162490 });
    expect(baseline?.winrate).toBeCloseTo(0.5098, 8);
});

test("does not label a different tier or unavailable page as the requested tier", () => {
    expect(extractLolalyticsBaseline(html, "silver")).toBeUndefined();
    expect(extractLolalyticsBaseline("<html></html>", "gold")).toBeUndefined();
});
