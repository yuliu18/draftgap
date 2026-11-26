// CommunityDragon names some stat shard icons differently from the shard key.
const ICON_NAME_BY_KEY: Record<string, string> = {
    health: "healthplus",
    tenacityandslowresist: "tenacity",
};

export function statShardIconUrl(key: string) {
    const lower = key.toLowerCase();
    const name = ICON_NAME_BY_KEY[lower] ?? lower;
    return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/perk-images/statmods/statmods${name}icon.png`;
}
