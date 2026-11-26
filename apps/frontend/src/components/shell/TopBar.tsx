import { For, createSignal } from "solid-js";
import { formatDistance } from "date-fns";
import { useDraftView } from "../../contexts/DraftViewContext";
import { useDataset } from "../../contexts/DatasetContext";
import { useI18n } from "../../contexts/I18nContext";
import { formatPatch } from "../../utils/strings";
import { cn } from "../../utils/style";
import { Dialog, DialogTrigger } from "../common/Dialog";
import { ProButton } from "../common/Pro";
import SettingsDialog from "../dialogs/SettingsDialog";
import { FAQDialog } from "../dialogs/FAQDialog";
import { DesktopAppDialog } from "../dialogs/DesktopAppDialog";
import { LolClientStatusBadge } from "../draft/LolClientStatusBadge";
import { LanguageDropdownMenu } from "../LanguageMenu";
import { OptionsDropdownMenu } from "../OptionsMenu";

type NavItem = {
    label: "nav.select" | "nav.build" | "nav.match" | "nav.account";
    views: readonly string[];
    target: "draft" | "builds" | "match" | "account";
};

const NAV: readonly NavItem[] = [
    { label: "nav.select", views: ["draft", "analysis"], target: "draft" },
    { label: "nav.build", views: ["builds"], target: "builds" },
    { label: "nav.match", views: ["match"], target: "match" },
    { label: "nav.account", views: ["account"], target: "account" },
];

export function TopBar() {
    const { t, dateLocale } = useI18n();
    const { currentDraftView, setCurrentDraftView } = useDraftView();
    const { dataset } = useDataset();

    const [showSettings, setShowSettings] = createSignal(false);
    const [showFAQ, setShowFAQ] = createSignal(false);
    const [showDownloadModal, setShowDownloadModal] = createSignal(false);

    const timeAgo = () =>
        dataset()
            ? formatDistance(new Date(dataset()!.date), new Date(), {
                  addSuffix: true,
                  locale: dateLocale(),
              })
            : "";

    return (
        <header class="flex h-12 shrink-0 items-center gap-6 border-b border-pg-ln bg-pg-s1 px-4">
            <Dialog open={showFAQ()} onOpenChange={setShowFAQ}>
                <FAQDialog />
            </Dialog>
            <Dialog
                open={showDownloadModal()}
                onOpenChange={setShowDownloadModal}
            >
                <DesktopAppDialog open={showDownloadModal()} />
            </Dialog>

            <div class="flex items-center gap-2 text-sm font-bold">
                <svg
                    width="20"
                    height="20"
                    viewBox="0 0 20 20"
                    aria-hidden="true"
                    class="block"
                >
                    <rect
                        x="1"
                        y="1"
                        width="18"
                        height="18"
                        rx="4"
                        fill="none"
                        stroke="var(--color-pg-ac)"
                        stroke-width="2"
                    />
                    <path
                        d="M6 14V6h4a3 3 0 0 1 0 6H8"
                        fill="none"
                        stroke="var(--color-pg-tx)"
                        stroke-width="2"
                    />
                </svg>
                DraftGap
            </div>

            <nav aria-label={t("nav.label")} class="flex h-full gap-1">
                <For each={NAV}>
                    {(item) => {
                        const active = () =>
                            item.views.includes(currentDraftView().type);
                        return (
                            <button
                                type="button"
                                aria-current={active() ? "page" : undefined}
                                class={cn(
                                    "mt-0.5 flex items-center border-b-2 border-transparent px-3 text-pg-mu transition-colors hover:text-pg-tx focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-pg-ac",
                                    active() && "border-pg-ac text-pg-tx",
                                )}
                                onClick={() => {
                                    if (!active()) {
                                        setCurrentDraftView({
                                            type: item.target,
                                        });
                                    }
                                }}
                            >
                                {t(item.label)}
                            </button>
                        );
                    }}
                </For>
            </nav>

            <div class="ml-auto flex items-center gap-4 text-xs text-pg-mu">
                <span title={t("app.lastUpdated", { time: timeAgo() })}>
                    {t("pro.patch")}{" "}
                    <b class="font-semibold text-pg-tx tabular-nums">
                        {formatPatch(dataset()?.version)}
                    </b>
                </span>
                <LolClientStatusBadge
                    setShowDownloadModal={setShowDownloadModal}
                />
                <div class="flex items-center gap-1">
                    <LanguageDropdownMenu />
                    <OptionsDropdownMenu
                        setShowSettings={setShowSettings}
                        setShowFAQ={setShowFAQ}
                    />
                </div>
                <Dialog open={showSettings()} onOpenChange={setShowSettings}>
                    <DialogTrigger as={ProButton} size="sm" class="text-pg-tx">
                        {t("menu.settings")}
                    </DialogTrigger>
                    <SettingsDialog />
                </Dialog>
            </div>
        </header>
    );
}
