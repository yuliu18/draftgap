import { describe, expect, test } from "bun:test";
import { Role } from "../models/Role";
import { resolveMatchupSlots } from "./matchup-slots";

const ahri = { championKey: "Ahri", role: Role.Middle };
const garen = { championKey: "Garen", role: Role.Top };
const zed = { championKey: "Zed", role: Role.Middle };
const darius = { championKey: "Darius", role: Role.Top };
const allyComp = new Map<Role, string>([
    [Role.Middle, ahri.championKey],
    [Role.Top, garen.championKey],
]);
const enemyComp = new Map<Role, string>([
    [Role.Middle, zed.championKey],
    [Role.Top, darius.championKey],
]);

describe("resolveMatchupSlots", () => {
    test("prefers the player's champion to the selected ally champion", () => {
        const result = resolveMatchupSlots(
            [ahri, garen],
            0,
            1,
            allyComp,
            enemyComp,
        );
        expect(result).toEqual({ me: ahri, opponent: zed });
    });

    test("falls back to the selected ally when the player's slot is empty", () => {
        const result = resolveMatchupSlots(
            [{}, garen],
            0,
            1,
            allyComp,
            enemyComp,
        );
        expect(result).toEqual({ me: garen, opponent: darius });
    });

    test("infers the player's role and uses the predicted enemy for that lane", () => {
        const result = resolveMatchupSlots(
            [{ championKey: ahri.championKey }],
            0,
            undefined,
            allyComp,
            enemyComp,
        );
        expect(result).toEqual({ me: ahri, opponent: zed });
    });

    test("keeps an explicitly assigned role even if the prediction differs", () => {
        const pick = { ...ahri, role: Role.Top };
        const result = resolveMatchupSlots(
            [pick],
            undefined,
            0,
            allyComp,
            enemyComp,
        );
        expect(result).toEqual({ me: pick, opponent: darius });
    });

    test("keeps the player's pick when no enemy is predicted for that role", () => {
        const result = resolveMatchupSlots(
            [ahri],
            0,
            undefined,
            allyComp,
            new Map([[Role.Top, darius.championKey]]),
        );
        expect(result).toEqual({ me: ahri, opponent: undefined });
    });

    test("does not substitute the selected ally when the player's role is unknown", () => {
        const result = resolveMatchupSlots(
            [{ championKey: "Unknown" }, garen],
            0,
            1,
            allyComp,
            enemyComp,
        );
        expect(result).toEqual({ me: undefined, opponent: undefined });
    });

    test("returns neither slot when no champion is picked", () => {
        const result = resolveMatchupSlots([{}, {}], 0, 1, allyComp, enemyComp);
        expect(result).toEqual({ me: undefined, opponent: undefined });
    });

    test("role 0 and own index 0 are not treated as missing", () => {
        expect(
            resolveMatchupSlots(
                [{ championKey: "Garen" }, garen],
                0,
                1,
                new Map([[Role.Top, "Garen"]]),
                new Map([[Role.Top, "Darius"]]),
            ),
        ).toEqual({
            me: { championKey: "Garen", role: Role.Top },
            opponent: { championKey: "Darius", role: Role.Top },
        });
    });

    test("an own slot without a champion that is also the selected slot gives nothing", () => {
        expect(
            resolveMatchupSlots([garen, {}], 1, 1, allyComp, enemyComp),
        ).toEqual({ me: undefined, opponent: undefined });
    });

    test("an own index outside the team falls back to the selected ally", () => {
        expect(resolveMatchupSlots([ahri], 7, 0, allyComp, enemyComp)).toEqual({
            me: ahri,
            opponent: zed,
        });
    });
});
