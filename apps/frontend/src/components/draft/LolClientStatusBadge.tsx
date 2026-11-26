import { useI18n } from "../../contexts/I18nContext";
import { Component, JSX, Match, Switch } from "solid-js";
import { ClientState, useLolClient } from "../../contexts/LolClientContext";
import { useMedia } from "../../hooks/useMedia";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "../common/Dialog";
import { Icon } from "solid-heroicons";
import { questionMarkCircle } from "solid-heroicons/solid-mini";

function StatusDot(props: {
    tone: "on" | "off" | "bad";
    children: JSX.Element;
}) {
    return (
        <span class="inline-flex items-center whitespace-nowrap">
            <span
                aria-hidden="true"
                class="mr-2 inline-block size-2 rounded-full"
                classList={{
                    "bg-pg-pos": props.tone === "on",
                    "bg-pg-dim": props.tone === "off",
                    "bg-pg-neg": props.tone === "bad",
                }}
            />
            {props.children}
        </span>
    );
}

type Props = {
    setShowDownloadModal: (show: boolean) => void;
};

export const LolClientStatusBadge: Component<Props> = (props) => {
    const { isDesktop } = useMedia();
    const { clientState, clientError } = useLolClient();
    const { t } = useI18n();

    return (
        <Switch>
            <Match when={!isDesktop}>
                <button
                    type="button"
                    onClick={() => props.setShowDownloadModal(true)}
                    class="hidden whitespace-nowrap text-pg-ac transition-colors hover:text-pg-ac-hover md:inline-flex"
                >
                    {t("client.sync")}
                </button>
            </Match>
            <Match when={clientState() === ClientState.Disabled}>
                <StatusDot tone="off">{t("client.disabled")}</StatusDot>
            </Match>
            <Match when={clientState() === ClientState.MainMenu}>
                <StatusDot tone="on">{t("client.connected")}</StatusDot>
            </Match>
            <Match when={clientState() === ClientState.InChampSelect}>
                <StatusDot tone="on">{t("client.champSelect")}</StatusDot>
            </Match>
            <Match when={clientState() === ClientState.NotFound}>
                <Dialog>
                    <DialogTrigger class="inline-flex items-center gap-1 transition-colors hover:text-pg-tx">
                        <StatusDot tone="bad">
                            {t("client.notConnected")}
                        </StatusDot>
                        <Icon
                            path={questionMarkCircle}
                            class="size-4 text-pg-dim"
                        />
                    </DialogTrigger>

                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>
                                {t("client.notFoundTitle")}
                            </DialogTitle>
                        </DialogHeader>
                        <p class="font-body">{t("client.notFoundBody")}</p>
                        <p class="font-body">
                            {t("client.adminError")}
                            <br />
                            <span
                                class="bg-neutral-800 px-2 py-1 rounded-sm"
                                style={{ "font-family": "monospace" }}
                            >
                                {clientError() ?? t("client.noError")}
                            </span>
                        </p>
                    </DialogContent>
                </Dialog>
            </Match>
        </Switch>
    );
};
