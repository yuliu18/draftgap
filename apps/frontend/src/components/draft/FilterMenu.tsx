import { Icon } from "solid-heroicons";
import { funnel } from "solid-heroicons/solid";
import { ButtonGroup, ButtonGroupOption } from "../common/ButtonGroup";
import { Popover, PopoverContent, PopoverTrigger } from "../common/Popover";
import { useUser } from "../../contexts/UserContext";
import { buttonVariants } from "../common/Button";
import { cn } from "../../utils/style";
import { useI18n } from "../../contexts/I18nContext";

export function FilterMenu() {
    const { config, setConfig } = useUser();
    const { t } = useI18n();

    const minGameCountOptions: ButtonGroupOption<number>[] = [
        500, 1000, 2500, 5000,
    ].map((n) => ({
        value: n,
        label: n.toString(),
    }));

    return (
        <Popover>
            <PopoverTrigger
                class={cn(
                    buttonVariants({ variant: "transparent" }),
                    "size-7 justify-center px-0 text-pg-mu",
                )}
            >
                <Icon path={funnel} class="size-4" />
            </PopoverTrigger>
            <PopoverContent>
                <span class="text-2xl uppercase block mb-1 leading-none">
                    {t("draft.filters")}
                </span>
                <span class="text-lg uppercase block">
                    {t("draft.minGames")}
                </span>
                <ButtonGroup
                    options={minGameCountOptions}
                    selected={config.minGames}
                    onChange={(value: number) =>
                        setConfig({
                            minGames: value,
                        })
                    }
                />
            </PopoverContent>
        </Popover>
    );
}
