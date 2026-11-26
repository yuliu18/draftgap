import { Icon } from "solid-heroicons";
import { ellipsisVertical } from "solid-heroicons/outline";
import { trash } from "solid-heroicons/solid-mini";
import { useDraft } from "../../contexts/DraftContext";
import { Team } from "@draftgap/core/src/models/Team";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuIcon,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "../common/DropdownMenu";
import { cn } from "../../utils/style";
import { buttonVariants } from "../common/Button";
import { ContextMenuContent } from "../common/ContextMenu";
import { useI18n } from "../../contexts/I18nContext";

type Props = {
    team: Team;
    class?: string;
};
export function TeamOptions(props: Props) {
    return (
        <div class={cn("absolute right-0 top-0", props.class)}>
            <DropdownMenu>
                <DropdownMenuTrigger>
                    <button
                        class={cn(
                            buttonVariants({ variant: "transparent" }),
                            "px-1 py-2",
                        )}
                    >
                        <Icon path={ellipsisVertical} class="h-7" />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                    <TeamOptionsItems team={props.team} />
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}

export function TeamOptionsContextMenuContent(props: { team: Team }) {
    return (
        <ContextMenuContent>
            <TeamOptionsItems team={props.team} />
        </ContextMenuContent>
    );
}

export function TeamOptionsItems(props: { team: Team }) {
    const { resetTeam } = useDraft();
    const { t, teamName } = useI18n();

    return (
        <>
            <DropdownMenuLabel>
                {t("draft.teamLabel", { team: teamName(props.team) })}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
                <DropdownMenuItem onSelect={() => resetTeam(props.team)}>
                    <DropdownMenuIcon path={trash} />
                    <span>{t("draft.resetTeam")}</span>
                </DropdownMenuItem>
            </DropdownMenuGroup>
        </>
    );
}
