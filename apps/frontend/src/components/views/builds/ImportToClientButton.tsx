import { Component, Show, createEffect, createSignal, on } from "solid-js";
import { isTauri } from "@tauri-apps/api/core";
import { RecommendedBuild } from "@draftgap/core/src/builds/recommended-build";
import { toClientImportInputs } from "@draftgap/core/src/builds/client-import";
import { importFailureMessage } from "@draftgap/core/src/builds/import-message";
import { importItemSet, importRunePage } from "../../../api/lcu-import-api";
import { buttonVariants } from "../../common/Button";
import { useDataset } from "../../../contexts/DatasetContext";
import { useI18n } from "../../../contexts/I18nContext";

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
    const { dataset } = useDataset();
    const [state, setState] = createSignal<State>({ type: "idle" });

    // The client write only uses the champion and role the build was computed
    // for (props.build), never the live selection. Another build starts clean.
    let generation = 0;
    createEffect(
        on(
            () => [props.build.championKey, props.build.role] as const,
            () => {
                generation++;
                setState({ type: "idle" });
            },
            { defer: true },
        ),
    );

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

    const run = async () => {
        const { championKey: key, role: roleValue } = props.build;
        const champion = dataset()?.championData[key]?.name;
        if (!key || !champion || state().type === "busy") return;
        const role = roleValue === undefined ? "" : roleName(roleValue);
        const { runes, items } = inputs();
        const mine = ++generation;

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
            if (mine === generation) {
                setState({ type: "done", written, skippedRunes: !runes });
            }
        } catch (e) {
            console.error("Import to client failed", e);
            if (mine === generation) {
                setState({
                    type: "error",
                    message: importFailureMessage(t, e, written),
                });
            }
        }
    };

    return (
        <Show when={isTauri() && canImport()}>
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
