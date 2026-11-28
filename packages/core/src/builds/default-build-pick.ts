/**
 * Which ally slot the Build screen opens on: the player's own slot (known from
 * the client's champ select) when it has a champion, else the selected slot,
 * else the first slot with a champion. -1 when no ally has a champion.
 */
export function defaultBuildPickIndex(
    picked: readonly boolean[],
    ownIndex: number | undefined,
    selectedIndex: number | undefined,
) {
    for (const index of [ownIndex, selectedIndex]) {
        if (index !== undefined && picked[index] === true) return index;
    }
    return picked.findIndex((p) => p);
}
