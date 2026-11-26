import { invoke, isTauri } from "@tauri-apps/api/core";
import {
    BuildDataNeedsDesktopError,
    PageFetcher,
} from "@draftgap/core/src/builds/lolalytics-page";

// Reads a public lolalytics.com build page through the read-only Rust command
// (the site sends no CORS headers). The web build cannot, so it throws a typed
// error that the Builds view translates.
export const fetchLolalyticsPage: PageFetcher = async (url) => {
    if (!isTauri()) {
        throw new BuildDataNeedsDesktopError();
    }
    return (await invoke("fetch_lolalytics_page", { url })) as string;
};
