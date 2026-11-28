import { describe, expect, test } from "bun:test";
import { defaultBuildPickIndex } from "./default-build-pick";

describe("defaultBuildPickIndex", () => {
    test("the player's own slot wins over the selected slot and the first pick", () => {
        expect(
            defaultBuildPickIndex([true, true, true, false, false], 2, 1),
        ).toBe(2);
    });

    test("without a champion in the own slot, the selected slot is used", () => {
        expect(
            defaultBuildPickIndex([true, true, false, false, false], 2, 1),
        ).toBe(1);
    });

    test("with no own slot (no client), the selected slot is used, else the first pick", () => {
        expect(defaultBuildPickIndex([false, true, true], undefined, 2)).toBe(
            2,
        );
        expect(
            defaultBuildPickIndex([false, true, true], undefined, undefined),
        ).toBe(1);
        expect(defaultBuildPickIndex([false, true, true], undefined, 0)).toBe(
            1,
        );
    });

    test("no pick at all, or an own slot outside the team, gives -1 or the fallback", () => {
        expect(defaultBuildPickIndex([false, false], 0, 1)).toBe(-1);
        expect(defaultBuildPickIndex([true, false], 7, undefined)).toBe(0);
        expect(defaultBuildPickIndex([true, false], -1, undefined)).toBe(0);
    });
});
