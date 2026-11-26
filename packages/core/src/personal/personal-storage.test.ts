import { describe, expect, test } from "bun:test";
import {
    parsePersonalMatches,
    serializePersonalMatches,
} from "./personal-storage";
import { Role } from "../models/Role";

const valid = [
    { championKey: "103", role: Role.Middle, win: true, timestamp: 1000 },
    { championKey: "238", role: Role.Support, win: false, timestamp: 2000 },
];

describe("personal storage codec", () => {
    test("round trips matches", () => {
        expect(parsePersonalMatches(serializePersonalMatches(valid))).toEqual(
            valid,
        );
    });

    test("round trips an empty list", () => {
        expect(parsePersonalMatches(serializePersonalMatches([]))).toEqual([]);
    });

    test("returns [] for null, undefined and empty input", () => {
        expect(parsePersonalMatches(null)).toEqual([]);
        expect(parsePersonalMatches(undefined)).toEqual([]);
        expect(parsePersonalMatches("")).toEqual([]);
    });

    test("returns [] for invalid JSON without throwing", () => {
        expect(parsePersonalMatches("{not json")).toEqual([]);
    });

    test("returns [] for non-array JSON", () => {
        expect(parsePersonalMatches('{"championKey":"1"}')).toEqual([]);
        expect(parsePersonalMatches("42")).toEqual([]);
        expect(parsePersonalMatches("null")).toEqual([]);
        expect(parsePersonalMatches('"text"')).toEqual([]);
    });

    test("drops invalid entries and keeps valid ones", () => {
        const raw = JSON.stringify([
            valid[0],
            null,
            "x",
            42,
            { ...valid[0], championKey: "" },
            { ...valid[0], championKey: 5 },
            { ...valid[0], role: 5 },
            { ...valid[0], role: -1 },
            { ...valid[0], role: 1.5 },
            { ...valid[0], role: "2" },
            { ...valid[0], win: "true" },
            { ...valid[0], timestamp: "1" },
            { ...valid[0], timestamp: null },
            { championKey: "1", role: 0, win: true },
            valid[1],
        ]);
        expect(parsePersonalMatches(raw)).toEqual(valid);
    });

    test("drops entries with extra fields stripped to PersonalMatch shape", () => {
        const raw = JSON.stringify([{ ...valid[0], extra: "x" }]);
        expect(parsePersonalMatches(raw)).toEqual([valid[0]]);
    });
});
