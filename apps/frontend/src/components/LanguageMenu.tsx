import { Icon } from "solid-heroicons";
import { language } from "solid-heroicons/solid";
import { Component } from "solid-js";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "./common/DropdownMenu";
import { cn } from "../utils/style";
import { buttonVariants } from "./common/Button";
import { useUser } from "../contexts/UserContext";
import { useI18n } from "../contexts/I18nContext";

export const LanguageDropdownMenu: Component = () => {
    const { config, setConfig } = useUser();
    const { t } = useI18n();

    return (
        <DropdownMenu>
            <DropdownMenuTrigger>
                <button
                    aria-label={t("menu.language")}
                    class={cn(
                        buttonVariants({ variant: "transparent" }),
                        "size-7 justify-center px-0 text-pg-mu hover:text-pg-tx",
                    )}
                >
                    <Icon path={language} class="size-5" />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent class="w-56">
                <DropdownMenuLabel>{t("menu.language")}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                    <DropdownMenuItem
                        onSelect={() => setConfig({ language: "en_US" })}
                        class={cn(
                            config.language === "en_US" && "bg-neutral-700",
                        )}
                    >
                        <span>{t("menu.language.en")}</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        onSelect={() => setConfig({ language: "es_ES" })}
                        class={cn(
                            config.language === "es_ES" && "bg-neutral-700",
                        )}
                    >
                        <span>{t("menu.language.es")}</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        onSelect={() => setConfig({ language: "zh_CN" })}
                        class={cn(
                            config.language === "zh_CN" && "bg-neutral-700",
                        )}
                    >
                        <span>{t("menu.language.zh")}</span>
                    </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuLabel class="text-neutral-500 text-sm">
                    {t("menu.language.note")}
                </DropdownMenuLabel>
            </DropdownMenuContent>
        </DropdownMenu>
    );
};
