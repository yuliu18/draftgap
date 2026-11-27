import { invoke, isTauri } from "@tauri-apps/api/core";
import { lolalyticsTier } from "@draftgap/core/src/builds/lolalytics-page";

export async function getOwnRankTier() {
    if (!isTauri()) return undefined;
    try {
        const tier = await invoke<string | null>("get_own_rank");
        return tier === null ? undefined : lolalyticsTier(tier);
    } catch {
        return undefined;
    }
}
