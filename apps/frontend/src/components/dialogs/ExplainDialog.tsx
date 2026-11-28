import { For, Match, Show, Switch, createSignal, onMount } from "solid-js";
import { Suggestion } from "@draftgap/core/src/draft/suggestions";
import { PersonalizedSuggestion } from "@draftgap/core/src/personal/personalize";
import { DialogContent, DialogHeader, DialogTitle } from "../common/Dialog";
import { type LlmRequestDetails, useLlm } from "../../contexts/LlmContext";
import { useI18n } from "../../contexts/I18nContext";

type Props = {
    suggestions: (Suggestion & Partial<PersonalizedSuggestion>)[];
};

type State =
    | { status: "busy" }
    | { status: "result"; text: string }
    | { status: "error"; message: string };

export function LlmRequestDisclosure(props: { request: LlmRequestDetails }) {
    const { t } = useI18n();
    return (
        <details class="min-w-0 rounded border border-pg-ln2 bg-pg-s2 px-3 py-2 text-sm text-pg-tx">
            <summary class="cursor-pointer text-pg-mu">
                {t("llm.requestDetails")}
            </summary>
            <p class="mt-2 break-words">
                {t("llm.requestModel", { model: props.request.model })}
            </p>
            <p class="break-words">
                {t("llm.requestHost", { host: props.request.host || "—" })}
            </p>
            <div class="mt-2 max-h-56 space-y-2 overflow-auto rounded border border-pg-ln bg-pg-bg p-2 font-mono text-xs">
                <For each={props.request.messages}>
                    {(message) => (
                        <div>
                            <p class="font-bold text-pg-mu">{message.role}</p>
                            <pre class="whitespace-pre-wrap break-words">
                                {message.content}
                            </pre>
                        </div>
                    )}
                </For>
            </div>
        </details>
    );
}

export function ExplainDialog(props: Props) {
    const { explain, isConfigured, lastRequest } = useLlm();
    const { t } = useI18n();
    const [state, setState] = createSignal<State>({ status: "busy" });
    const [request, setRequest] = createSignal<LlmRequestDetails>();

    const resultText = () => {
        const current = state();
        return current.status === "result" ? current.text : undefined;
    };
    const errorMessage = () => {
        const current = state();
        return current.status === "error" ? current.message : undefined;
    };

    onMount(async () => {
        if (!isConfigured()) {
            setState({ status: "error", message: t("explain.notConfigured") });
            return;
        }
        try {
            const previous = lastRequest();
            const result = explain(props.suggestions);
            const current = lastRequest();
            if (current !== previous) setRequest(current);
            setState({ status: "result", text: await result });
        } catch (e) {
            setState({
                status: "error",
                message: e instanceof Error ? e.message : String(e),
            });
        }
    });

    return (
        <DialogContent class="max-w-xl">
            <DialogHeader>
                <DialogTitle>{t("explain.title")}</DialogTitle>
            </DialogHeader>
            <Switch>
                <Match when={state().status === "busy"}>
                    <span class="text-neutral-400">{t("explain.busy")}</span>
                </Match>
                <Match when={resultText()} keyed>
                    {(text) => (
                        <div class="flex flex-col gap-2">
                            <p class="whitespace-pre-wrap">{text}</p>
                            <span class="text-sm text-neutral-400">
                                {t("explain.disclaimer")}
                            </span>
                        </div>
                    )}
                </Match>
                <Match when={errorMessage()} keyed>
                    {(message) => (
                        <span class="text-red-400 whitespace-pre-wrap">
                            {message}
                        </span>
                    )}
                </Match>
            </Switch>
            <Show when={request()} keyed>
                {(details) => <LlmRequestDisclosure request={details} />}
            </Show>
        </DialogContent>
    );
}
