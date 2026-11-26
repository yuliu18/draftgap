import { Component, Show, createSignal } from "solid-js";
import { RecommendedBuild } from "@draftgap/core/src/builds/recommended-build";
import { toClientImportInputs } from "@draftgap/core/src/builds/client-import";
import { importItemSet, importRunePage } from "../../../api/lcu-import-api";
import { buttonVariants } from "../../common/Button";
import { useBuild } from "../../../contexts/BuildContext";
import { useDataset } from "../../../contexts/DatasetContext";
import { useI18n } from "../../../contexts/I18nContext";
import { useMedia } from "../../../hooks/useMedia";

type State =
    | { type: "idle" }
    | { type: "busy" }
    | { type: "done"; written: string[]; skippedRunes: boolean }
    | { type: "error"; message: string };

// Writes a rune page and an item set to the League client, only on click.
export const ImportToClientButton: Component<{ build: RecommendedBuild }> = (
    props,
) => {
    const { t, roleName } = useI18n();
    const { isDesktop } = useMedia();
    const { dataset } = useDataset();
    const { championKey, championRole } = useBuild();
    const [state, setState] = createSignal<State>({ type: "idle" });

    const doneState = () => {
        const s = state();
        return s.type === "done" ? s : undefined;
    };
    const errorState = () => {
        const s = state();
        return s.type === "error" ? s : undefined;
    };

    const inputs = () => toClientImportInputs(props.build);
    const canImport = () => !!inputs().runes || !!inputs().items;

    const errorMessage = (e: unknown) => {
        const raw = String(e);
        const code = raw.split(":")[0].trim();
        switch (code) {
            case "page_limit":
                return t("build.import.error.pageLimit");
            case "client_not_running":
                return t("build.import.error.notRunning");
            case "unexpected_response":
                return t("build.import.error.unexpected");
            case "invalid_input":
                return t("build.import.error.invalid");
            default:
                return t("build.import.error.generic");
        }
    };

    const run = async () => {
        const key = championKey();
        const champion = key ? dataset()?.championData[key]?.name : undefined;
        const roleValue = championRole();
        if (!key || !champion || state().type === "busy") return;
        const role = roleValue === undefined ? "" : roleName(roleValue);
        const { runes, items } = inputs();

        setState({ type: "busy" });
        const written: string[] = [];
        try {
            if (runes) {
                await importRunePage(champion, role, runes);
                written.push(t("build.import.what.runes"));
            }
            if (items) {
                await importItemSet(key, champion, role, items);
                written.push(t("build.import.what.items"));
            }
            setState({ type: "done", written, skippedRunes: !runes });
        } catch (e) {
            console.error("Import to client failed", e);
            const done = written.length
                ? ` ${t("build.import.partial", { written: written.join(", ") })}`
                : "";
            setState({ type: "error", message: errorMessage(e) + done });
        }
    };

    return (
        <Show when={isDesktop && canImport()}>
            <div class="flex flex-col gap-1 items-start">
                <button
                    type="button"
                    class={buttonVariants({ variant: "secondary" })}
                    disabled={state().type === "busy"}
                    onClick={run}
                >
                    {state().type === "busy"
                        ? t("build.import.busy")
                        : t("build.import")}
                </button>
                <Show when={!inputs().runes}>
                    <span class="text-sm text-neutral-500">
                        {t("build.import.itemsOnly")}
                    </span>
                </Show>
                <Show when={doneState()}>
                    {(s) => (
                        <span class="text-sm text-winrate-good">
                            {t("build.import.done", {
                                written: s().written.join(", "),
                            })}
                        </span>
                    )}
                </Show>
                <Show when={errorState()}>
                    {(s) => (
                        <span class="text-sm text-winrate-shiggo">
                            {s().message}
                        </span>
                    )}
                </Show>
            </div>
        </Show>
    );
};
