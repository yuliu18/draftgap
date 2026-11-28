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
import { useBuild } from "../../../contexts/BuildContext";
import { useI18n } from "../../../contexts/I18nContext";

type State =
    | { type: "idle" }
    | { type: "done"; written: string[] }
    | { type: "error"; message: string };

// The build view can remount while a client write is pending.
const [importing, setImporting] = createSignal(false);

// Writes a rune page and an item set to the League client, only on click.
export const ImportToClientButton: Component<{ build: RecommendedBuild }> = (
    props,
) => {
    const { t, roleName, localeTag } = useI18n();
    const { dataset } = useDataset();
    const { situational } = useBuild();
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

    const inputs = createMemo(() =>
        toClientImportInputs(props.build, situational()),
    );
    const [includeRunes, setIncludeRunes] = createSignal(true);
    const [includeItems, setIncludeItems] = createSignal(true);
    const canImport = () =>
        (includeRunes() && !!inputs().runes) ||
        (includeItems() && !!inputs().items);

    const run = async () => {
        const { championKey: key, role: roleValue } = props.build;
        const champion = dataset()?.championData[key]?.name;
        if (!key || !champion || importing() || !canImport()) return;
        const role = roleValue === undefined ? "" : roleName(roleValue);
        const available = inputs();
        const runes = includeRunes() ? available.runes : undefined;
        const { focus, magicShare } = situational();
        const items = includeItems() ? available.items : undefined;
        const blocks = items?.blocks.map((block) => {
            const { kind } = block;
            let title = t(`build.import.block.${kind}`);
            if (
                magicShare !== undefined &&
                ((focus === "magic" && kind === "magicResist") ||
                    (focus === "physical" && kind === "armor"))
            ) {
                const fraction =
                    focus === "magic" ? magicShare : 1 - magicShare;
                const share = fraction.toLocaleString(localeTag(), {
                    style: "percent",
                    maximumFractionDigits: 0,
                });
                title = t(`build.import.focus.${focus}`, { title, share });
            }
            return {
                title: Array.from(title).slice(0, 40).join("").trimEnd(),
                items: block.items,
            };
        });
        const mine = ++generation;

        setImporting(true);
        setState({ type: "idle" });
        const written: string[] = [];
        try {
            if (runes) {
                const page = await importRunePage(champion, role, runes);
                written.push(
                    t(
                        page.selected
                            ? "build.import.what.runes"
                            : "build.import.what.runesNotSelected",
                    ),
                );
            }
            if (blocks) {
                await importItemSet(key, champion, role, blocks);
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
        } finally {
            setImporting(false);
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
                        disabled={!inputs().runes || importing()}
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
                        disabled={!inputs().items || importing()}
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
                    disabled={importing() || !canImport()}
                    onClick={run}
                >
                    {importing() ? t("build.import.busy") : t("build.import")}
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
