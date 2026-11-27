import { invoke } from "@tauri-apps/api/core";
import {
    ClientItemInput,
    ClientRuneInput,
} from "@draftgap/core/src/builds/client-import";

// The only two writes to the League client (S11). Each is a dedicated Tauri
// command with a fixed path in Rust; call them only from an explicit user click.
// Rejections are strings: "code" or "code: detail" (see lcu_import.rs).

export async function importRunePage(
    championName: string,
    role: string,
    runes: ClientRuneInput,
): Promise<{
    action: "created" | "replaced";
    name: string;
    selected: boolean;
}> {
    return (await invoke("import_rune_page", {
        championName,
        role,
        primaryStyleId: runes.primaryStyleId,
        subStyleId: runes.subStyleId,
        perkIds: runes.perkIds,
    })) as { action: "created" | "replaced"; name: string; selected: boolean };
}

export async function importItemSet(
    championKey: string,
    championName: string,
    role: string,
    items: ClientItemInput,
): Promise<string> {
    return (await invoke("import_item_set", {
        championKey,
        championName,
        role,
        startingItems: items.startingItems,
        boots: items.boots ?? null,
        coreItems: items.coreItems,
    })) as string;
}
