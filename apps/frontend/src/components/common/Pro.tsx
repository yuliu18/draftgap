import { For, JSX, Show, splitProps } from "solid-js";
import { cn } from "../../utils/style";

export function ProPanel(props: JSX.HTMLAttributes<HTMLElement>) {
    const [local, other] = splitProps(props, ["class", "children"]);
    return (
        <section
            {...other}
            class={cn(
                "flex flex-col min-h-0 bg-pg-s1 border border-pg-ln rounded-lg",
                local.class,
            )}
        >
            {local.children}
        </section>
    );
}

export function ProPanelHead(props: {
    title: JSX.Element;
    aside?: JSX.Element;
    class?: string;
}) {
    return (
        <div
            class={cn(
                "h-10 shrink-0 px-4 flex items-center justify-between gap-3 border-b border-pg-ln",
                props.class,
            )}
        >
            <h2 class="text-xs leading-4 font-semibold text-pg-mu truncate">
                {props.title}
            </h2>
            <Show when={props.aside}>
                <div class="flex items-center gap-3 shrink-0 text-[11px] text-pg-dim">
                    {props.aside}
                </div>
            </Show>
        </div>
    );
}

/** Label / value row separated by a 1px line. */
export function ProRow(props: {
    label: JSX.Element;
    children: JSX.Element;
    class?: string;
}) {
    return (
        <div
            class={cn(
                "flex h-8 items-center justify-between border-b border-pg-ln last:border-b-0",
                props.class,
            )}
        >
            <span class="text-pg-mu">{props.label}</span>
            <span class="font-semibold">{props.children}</span>
        </div>
    );
}

export function ProButton(
    props: JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
        variant?: "default" | "primary";
        size?: "sm" | "md" | "lg";
    },
) {
    const [local, other] = splitProps(props, [
        "class",
        "variant",
        "size",
        "children",
    ]);
    return (
        <button
            type="button"
            {...other}
            class={cn(
                "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md border px-3 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pg-ac disabled:opacity-40 disabled:pointer-events-none",
                local.size === "sm"
                    ? "h-7"
                    : local.size === "lg"
                      ? "h-9"
                      : "h-8",
                local.variant === "primary"
                    ? "bg-pg-ac border-pg-ac text-pg-ac-ink font-semibold hover:bg-pg-ac-hover"
                    : "bg-pg-s2 border-pg-ln2 hover:border-pg-mu",
                local.class,
            )}
        >
            {local.children}
        </button>
    );
}

export function Seg<T extends string | number | boolean>(props: {
    options: readonly { value: T; label: string }[];
    value: T;
    onChange: (value: T) => void;
    label?: string;
    class?: string;
}) {
    return (
        <div
            role="group"
            aria-label={props.label}
            class={cn(
                "inline-flex overflow-hidden rounded-md border border-pg-ln2",
                props.class,
            )}
        >
            <For each={props.options}>
                {(option) => (
                    <button
                        type="button"
                        aria-pressed={option.value === props.value}
                        class="h-6 px-2 text-xs text-pg-mu transition-colors hover:text-pg-tx aria-pressed:bg-pg-s3 aria-pressed:text-pg-tx focus-visible:outline-2 focus-visible:outline-pg-ac"
                        onClick={() => props.onChange(option.value)}
                    >
                        {option.label}
                    </button>
                )}
            </For>
        </div>
    );
}

/** Thin progress bar; `value` is 0..1. */
export function ProBar(props: {
    value: number;
    class?: string;
    trackClass?: string;
}) {
    return (
        <span
            class={cn(
                "block h-1 rounded-[2px] bg-pg-s3 overflow-hidden",
                props.trackClass,
                props.class,
            )}
        >
            <i
                class="block h-full bg-pg-ac"
                style={{
                    width: `${Math.max(0, Math.min(1, props.value)) * 100}%`,
                }}
            />
        </span>
    );
}
