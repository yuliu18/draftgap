import { Match, Switch, createSignal, onMount } from "solid-js";
import { Suggestion } from "@draftgap/core/src/draft/suggestions";
import { PersonalizedSuggestion } from "@draftgap/core/src/personal/personalize";
import { DialogContent, DialogHeader, DialogTitle } from "../common/Dialog";
import { useLlm } from "../../contexts/LlmContext";
import { useI18n } from "../../contexts/I18nContext";

type Props = {
    suggestions: (Suggestion & Partial<PersonalizedSuggestion>)[];
};

type State =
    | { status: "busy" }
    | { status: "result"; text: string }
    | { status: "error"; message: string };

export function ExplainDialog(props: Props) {
    const { explain, isConfigured } = useLlm();
    const { t } = useI18n();
    const [state, setState] = createSignal<State>({ status: "busy" });

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
            const text = await explain(props.suggestions);
            setState({ status: "result", text });
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
        </DialogContent>
    );
}
