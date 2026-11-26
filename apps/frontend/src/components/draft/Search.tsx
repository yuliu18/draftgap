import { useI18n } from "../../contexts/I18nContext";
import { Icon } from "solid-heroicons";
import { magnifyingGlass, xMark } from "solid-heroicons/outline";
import { onCleanup, onMount, Show } from "solid-js";
import { useDraftFilters } from "../../contexts/DraftFiltersContext";
import { useUser } from "../../contexts/UserContext";

export function focusSearch() {
    document.getElementById("draftTableSearch")?.focus();
}

export function Search() {
    const { search, setSearch } = useDraftFilters();
    const { setConfig } = useUser();
    const { t } = useI18n();

    // eslint-disable-next-line prefer-const -- solid js ref
    let inputEl: HTMLInputElement | undefined = undefined;

    function onInput(e: Event) {
        const input = e.currentTarget as HTMLInputElement;
        setSearch(input.value);
        if (input.value === "DANGEROUSLY_ENABLE_BETA_FEATURES") {
            setConfig((config) => ({ ...config, enableBetaFeatures: true }));
            setSearch("");
        }
        if (input.value === "DANGEROUSLY_DISABLE_BETA_FEATURES") {
            setConfig((config) => ({ ...config, enableBetaFeatures: false }));
            setSearch("");
        }
    }

    onMount(() => {
        if (!inputEl) return;
        const el = inputEl as HTMLInputElement;

        const onControlF = (e: KeyboardEvent) => {
            if (e.ctrlKey && (e.key === "f" || e.key == "k")) {
                e.preventDefault();
                el.focus();
            }
        };
        window.addEventListener("keydown", onControlF);

        const onTabOrEnter = (e: KeyboardEvent) => {
            if (e.key === "Tab" || e.key === "Enter") {
                e.preventDefault();
                const firstTableRow = document.querySelector("table tbody tr");
                if (firstTableRow) {
                    (firstTableRow as HTMLElement).focus();
                }
            }
        };

        el.addEventListener("keydown", onTabOrEnter);
        onCleanup(() => {
            el.removeEventListener("keydown", onTabOrEnter);
            window.removeEventListener("keydown", onControlF);
        });
    });

    return (
        <div class="flex min-w-0 flex-1 rounded-md">
            <div class="relative flex grow items-stretch">
                <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5">
                    <Icon
                        path={magnifyingGlass}
                        class="size-4 text-pg-dim"
                        aria-hidden="true"
                    />
                </div>
                <input
                    ref={inputEl}
                    id="draftTableSearch"
                    class="block h-7 w-full min-w-0 rounded-md border border-pg-ln2 bg-pg-s2 pl-8 pr-7 text-[13px] text-pg-tx placeholder:text-pg-dim focus-visible:outline-2 focus-visible:outline-pg-ac"
                    placeholder={t("draft.search")}
                    value={search()}
                    onInput={onInput}
                />
                <Show when={search().length}>
                    <button
                        class="absolute inset-y-0 right-0 flex items-center pr-2"
                        onClick={() => setSearch("")}
                    >
                        <Icon
                            path={xMark}
                            class="size-4 text-pg-dim"
                            aria-hidden="true"
                        />
                    </button>
                </Show>
            </div>
        </div>
    );
}
