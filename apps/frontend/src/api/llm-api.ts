import { invoke } from "@tauri-apps/api/core";

// The API key only ever travels webview -> Rust; no command returns it.
export async function llmSetApiKey(
    key: string,
    baseUrl: string,
): Promise<void> {
    await invoke("llm_set_api_key", { key, baseUrl });
}

export async function llmClearApiKey(): Promise<void> {
    await invoke("llm_clear_api_key");
}

export async function llmHasApiKey(baseUrl: string): Promise<boolean> {
    return invoke<boolean>("llm_has_api_key", { baseUrl });
}

export async function llmListModels(baseUrl: string): Promise<string[]> {
    return invoke<string[]>("llm_list_models", { baseUrl });
}

// Raw, unverified response body; validated by extractExplanation in core.
export async function llmChat(
    baseUrl: string,
    model: string,
    messages: { role: string; content: string }[],
): Promise<unknown> {
    return (await invoke("llm_chat", { baseUrl, model, messages })) as unknown;
}
