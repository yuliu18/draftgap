import {
    Component,
    Show,
    createEffect,
    createMemo,
    createSignal,
    on,
} from "solid-js";
import { isTauri } from "@tauri-apps/api/core";
import { RecommendedBuild } from "@draftgap/core/src/builds/recommended-build";
import { toClientImportInputs } from "@draftgap/core/src/builds/client-import";
import { importFailureMessage } from "@draftgap/core/src/builds/import-message";
import { importItemSet, importRunePage } from "../../../api/lcu-import-api";
import { ProButton } from "../../common/Pro";
import { useDataset } from "../../../contexts/DatasetContext";
import { useI18n } from "../../../contexts/I18nContext";

type State =
    | { type: "idle" }
    | { type: "busy" }
    | { type: "done"; written: string[] }
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

    const inputs = createMemo(() => toClientImportInputs(props.build));
    const [includeRunes, setIncludeRunes] = createSignal(true);
    const [includeItems, setIncludeItems] = createSignal(true);
    const canImport = () =>
        (includeRunes() && !!inputs().runes) ||
        (includeItems() && !!inputs().items);

    const run = async () => {
        const { championKey: key, role: roleValue } = props.build;
        const champion = dataset()?.championData[key]?.name;
        if (!key || !champion || state().type === "busy" || !canImport())
            return;
        const role = roleValue === undefined ? "" : roleName(roleValue);
        const available = inputs();
        const runes = includeRunes() ? available.runes : undefined;
        const items = includeItems() ? available.items : undefined;
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
                setState({ type: "done", written });
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
        <Show when={isTauri() && (inputs().runes || inputs().items)}>
            <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
                <label class="flex items-center gap-2 text-pg-mu">
                    <input
                        type="checkbox"
                        class="size-4 accent-pg-ac"
                        checked={includeRunes() && !!inputs().runes}
                        disabled={!inputs().runes || state().type === "busy"}
                        onChange={(e) =>
                            setIncludeRunes(e.currentTarget.checked)
                        }
                    />
                    {t("build.runes")}
                </label>
                <label class="flex items-center gap-2 text-pg-mu">
                    <input
                        type="checkbox"
                        class="size-4 accent-pg-ac"
                        checked={includeItems() && !!inputs().items}
                        disabled={!inputs().items || state().type === "busy"}
                        onChange={(e) =>
                            setIncludeItems(e.currentTarget.checked)
                        }
                    />
                    {t("build.items")}
                </label>
                <ProButton
                    variant="primary"
                    size="lg"
                    class="h-10 px-6"
                    disabled={state().type === "busy" || !canImport()}
                    onClick={run}
                >
                    {state().type === "busy"
                        ? t("build.import.busy")
                        : t("build.import")}
                </ProButton>
                <div aria-live="polite" class="basis-full empty:hidden">
                    <Show when={!inputs().runes}>
                        <span class="text-sm text-pg-mu">
                            {t("build.import.itemsOnly")}
                        </span>
                    </Show>
                    <Show when={doneState()}>
                        {(s) => (
                            <span class="text-sm text-pg-pos">
                                {t("build.import.done", {
                                    written: s().written.join(", "),
                                })}
                            </span>
                        )}
                    </Show>
                    <Show when={errorState()}>
                        {(s) => (
                            <span class="text-sm text-pg-neg">
                                {s().message}
                            </span>
                        )}
                    </Show>
                </div>
            </div>
        </Show>
    );
};
