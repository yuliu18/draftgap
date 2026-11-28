import { Icon } from "solid-heroicons";
import { Component, JSX, Show } from "solid-js";
import toast, { Toast as ToastModel } from "solid-toast";

type Props = {
    t: ToastModel;
    title: string;
    closeLabel?: string;
    content: string;
    icon: {
        path: JSX.Element;
        outline?: boolean;
        mini?: boolean;
    };
    dismissText?: string;
    okText?: string;
    onSubmit?: () => void;
};

export const Toast: Component<Props> = (props) => {
    return (
        <div
            class={`${
                props.t.visible ? "animate-enter" : "animate-leave"
            } relative w-full max-w-sm overflow-hidden rounded-md border border-pg-ln2 bg-pg-s2 text-pg-tx shadow-lg`}
        >
            <div class="p-3">
                <div class="flex items-start gap-2">
                    <div class="shrink-0 pt-0.5">
                        <Icon path={props.icon} class="size-5 text-pg-ac" />
                    </div>
                    <div class="min-w-0 flex-1">
                        <p class="text-sm font-semibold">{props.title}</p>
                        <p class="mt-1 text-sm text-pg-mu">{props.content}</p>
                        <Show when={props.dismissText && props.okText}>
                            <div class="mt-2 flex flex-wrap justify-end gap-2">
                                <button
                                    type="button"
                                    class="rounded border border-pg-ln2 px-2 py-1 text-xs font-medium text-pg-mu hover:bg-pg-s3 hover:text-pg-tx"
                                    onClick={() => toast.dismiss(props.t.id)}
                                >
                                    {props.dismissText}
                                </button>
                                <button
                                    type="button"
                                    class="rounded bg-pg-ac px-2 py-1 text-xs font-semibold text-pg-ac-ink hover:bg-pg-ac-hover"
                                    onClick={() => {
                                        toast.dismiss(props.t.id);
                                        props.onSubmit?.();
                                    }}
                                >
                                    {props.okText}
                                </button>
                            </div>
                        </Show>
                    </div>
                    <div class="flex shrink-0">
                        <button
                            class="inline-flex rounded p-0.5 text-pg-mu hover:bg-pg-s3 hover:text-pg-tx"
                            onClick={() => toast.dismiss(props.t.id)}
                        >
                            <span class="sr-only">
                                {props.closeLabel ?? "Close"}
                            </span>
                            <svg
                                class="h-5 w-5"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                            >
                                <path
                                    fill-rule="evenodd"
                                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                                    clip-rule="evenodd"
                                />
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
