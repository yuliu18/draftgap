import { invoke, isTauri } from "@tauri-apps/api/core";
import type {
    RiotRegion,
    RiotResponse,
} from "@draftgap/core/src/personal/riot-match-history";

async function invokeRiot<T>(
    command: string,
    args?: Record<string, unknown>,
): Promise<T> {
    if (!isTauri())
        throw new Error("Riot API is only available in the desktop app");
    return invoke<T>(command, args);
}

export const riotSetApiKey = (key: string) =>
    invokeRiot<void>("riot_set_api_key", { key });
export const riotHasApiKey = () =>
    isTauri()
        ? invokeRiot<boolean>("riot_has_api_key")
        : Promise.resolve(false);
export const riotDeleteApiKey = () => invokeRiot<void>("riot_delete_api_key");
export const riotGetClientRegion = () =>
    invokeRiot<string | null>("riot_get_client_region");

export const riotGetAccount = (
    region: RiotRegion,
    gameName: string,
    tagLine: string,
) =>
    invokeRiot<RiotResponse<unknown>>("riot_get_account", {
        region,
        gameName,
        tagLine,
    });
export const riotGetMatchIds = (
    region: RiotRegion,
    puuid: string,
    start: number,
    count: number,
) =>
    invokeRiot<RiotResponse<unknown>>("riot_get_match_ids", {
        region,
        puuid,
        start,
        count,
    });
export const riotGetMatch = (region: RiotRegion, matchId: string) =>
    invokeRiot<RiotResponse<unknown>>("riot_get_match", { region, matchId });
