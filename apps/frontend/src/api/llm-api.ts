import { invoke } from "@tauri-apps/api/core";

// The API key only ever travels webview -> Rust; no command returns it.
export async function llmSetApiKey(key: string): Promise<void> {
    await invoke("llm_set_api_key", { key });
}

export async function llmClearApiKey(): Promise<void> {
    await invoke("llm_clear_api_key");
}

export async function llmHasApiKey(): Promise<boolean> {
    return (await invoke("llm_has_api_key")) as boolean;
}

// Raw, unverified response body; validated by extractExplanation in core.
export async function llmChat(
    baseUrl: string,
    model: string,
    messages: { role: string; content: string }[],
): Promise<unknown> {
    return (await invoke("llm_chat", { baseUrl, model, messages })) as unknown;
}
