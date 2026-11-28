import { Role } from "../models/Role";

type Pick = { championKey?: string; role?: Role };
type Slot = { championKey: string; role: Role };

export function selectAllyMatchupPick(
    allies: readonly Pick[],
    ownIndex: number | undefined,
    selectedIndex: number | undefined,
) {
    const own = ownIndex === undefined ? undefined : allies[ownIndex];
    return own?.championKey !== undefined
        ? own
        : selectedIndex === undefined
          ? undefined
          : allies[selectedIndex];
}

export function resolveMatchupSlots(
    allies: readonly Pick[],
    ownIndex: number | undefined,
    selectedIndex: number | undefined,
    allyComp: ReadonlyMap<Role, string>,
    enemyComp: ReadonlyMap<Role, string>,
): { me?: Slot; opponent?: Slot } {
    const pick = selectAllyMatchupPick(allies, ownIndex, selectedIndex);
    if (pick?.championKey === undefined) {
        return { me: undefined, opponent: undefined };
    }

    const { championKey } = pick;
    const role =
        pick.role ?? [...allyComp].find(([, key]) => key === championKey)?.[0];
    if (role === undefined) return { me: undefined, opponent: undefined };

    const enemy = enemyComp.get(role);
    return {
        me: { championKey, role },
        opponent:
            enemy === undefined ? undefined : { championKey: enemy, role },
    };
}
