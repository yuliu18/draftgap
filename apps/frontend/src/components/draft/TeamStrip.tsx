import { For, Show } from "solid-js";
import { Icon } from "solid-heroicons";
import { chevronDown, lockClosed } from "solid-heroicons/solid-mini";
import { Team } from "@draftgap/core/src/models/Team";
import { getVisibleChampionKey, useDraft } from "../../contexts/DraftContext";
import { useDraftAnalysis } from "../../contexts/DraftAnalysisContext";
import { useI18n } from "../../contexts/I18nContext";
import { useDataset } from "../../contexts/DatasetContext";
import { useUser } from "../../contexts/UserContext";
import { createPickHotkeys } from "../../hooks/createPickHotkeys";
import { cn } from "../../utils/style";
import { championName } from "../../utils/i18n";
import { ChampionIcon } from "../icons/ChampionIcon";
import { ContextMenu, ContextMenuTrigger } from "../common/ContextMenu";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from "../common/DropdownMenu";
import {
    PickOptionsContent,
    PickOptionsContextMenuContent,
} from "./PickOptions";
import { TeamOptionsContextMenuContent, TeamOptionsItems } from "./TeamOptions";
import { BanRow } from "./BanRow";

const TEAMS = ["ally", "opponent"] as const;
const SLOTS = [0, 1, 2, 3, 4] as const;

function StripSlot(props: { team: Team; index: number }) {
    const { allyTeam, opponentTeam, selection, select } = useDraft();
    const { allyTeamComp, opponentTeamComp, analyzeHovers } =
        useDraftAnalysis();
    const { dataset } = useDataset();
    const { config } = useUser();
    const { t, roleName } = useI18n();
    const hotkeys = createPickHotkeys(
        () => props.team,
        () => props.index,
    );

    const pick = () =>
        (props.team === "ally" ? allyTeam : opponentTeam)[props.index];
    const comp = () =>
        props.team === "ally" ? allyTeamComp() : opponentTeamComp();
    const championKey = () => getVisibleChampionKey(pick(), analyzeHovers());
    const champion = () =>
        championKey() ? dataset()?.championData[championKey()!] : undefined;
    const slotLabel = () => {
        const current = champion();
        return current ? championName(current, config) : t("pro.pick");
    };
    const role = () =>
        [...comp().entries()].find(([, key]) => key === championKey())?.[0];
    const isSelected = () =>
        selection.type === "pick" &&
        selection.team === props.team &&
        selection.index === props.index;
    // The ally slot being filled is the player's own.
    const isMine = () => isSelected() && props.team === "ally";

    return (
        <ContextMenu>
            <ContextMenuTrigger
                as="li"
                class="flex w-14 list-none flex-col items-center gap-1"
                onMouseOver={hotkeys.onMouseOver}
                onMouseOut={hotkeys.onMouseOut}
            >
                <div
                    role="button"
                    tabIndex={0}
                    aria-label={slotLabel()}
                    aria-pressed={isSelected()}
                    class={cn(
                        "relative flex size-12 items-center justify-center overflow-hidden rounded border bg-[repeating-linear-gradient(135deg,#1b2028_0_6px,#171b21_6px_12px)] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pg-ac",
                        props.team === "opponent"
                            ? "border-pg-red-ln"
                            : "border-pg-ln2",
                        isSelected() &&
                            "border-pg-ac shadow-[0_0_0_1px_var(--color-pg-ac)]",
                        isMine() &&
                            !champion() &&
                            "border-dashed bg-pg-acb bg-none shadow-none",
                    )}
                    onClick={() => select(props.team, props.index)}
                    onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            select(props.team, props.index);
                        }
                    }}
                >
                    <Show
                        when={championKey() !== undefined && champion()}
                        fallback={
                            <span class="text-[11px] text-pg-mu">
                                {isMine() ? t("pro.you") : props.index + 1}
                            </span>
                        }
                    >
                        <ChampionIcon
                            championKey={championKey()!}
                            size={46}
                            class={cn(
                                "rounded-none",
                                pick().hover && "animate-pulse",
                            )}
                        />
                    </Show>
                </div>
                <DropdownMenu>
                    <DropdownMenuTrigger
                        as="button"
                        type="button"
                        class={cn(
                            "inline-flex max-w-full items-center gap-0.5 truncate text-[11px] leading-4 hover:text-pg-tx focus-visible:outline-2 focus-visible:outline-pg-ac",
                            isMine() ? "text-pg-ac" : "text-pg-dim",
                        )}
                        onClick={(event: MouseEvent) => event.stopPropagation()}
                    >
                        <Show when={champion() && pick().role !== undefined}>
                            <Icon path={lockClosed} class="size-2.5 shrink-0" />
                        </Show>
                        <span class="truncate">
                            {role() !== undefined
                                ? roleName(role()!)
                                : t("pro.pick")}
                        </span>
                    </DropdownMenuTrigger>
                    <PickOptionsContent team={props.team} index={props.index} />
                </DropdownMenu>
            </ContextMenuTrigger>
            <PickOptionsContextMenuContent
                team={props.team}
                index={props.index}
            />
        </ContextMenu>
    );
}

function StripTeam(props: { team: Team }) {
    const { t } = useI18n();

    return (
        <div class="w-[312px]">
            <div class="mb-1 flex h-4 items-center justify-between">
                <ContextMenu>
                    <ContextMenuTrigger as="div">
                        <DropdownMenu>
                            <DropdownMenuTrigger
                                as="button"
                                type="button"
                                class="inline-flex items-center gap-1 text-[11px] text-pg-mu hover:text-pg-tx focus-visible:outline-2 focus-visible:outline-pg-ac"
                            >
                                {props.team === "ally"
                                    ? t("pro.yourTeam")
                                    : t("pro.enemyTeam")}
                                <Icon
                                    path={chevronDown}
                                    class="size-2.5 opacity-60"
                                />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                                <TeamOptionsItems team={props.team} />
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </ContextMenuTrigger>
                    <TeamOptionsContextMenuContent team={props.team} />
                </ContextMenu>
                <div class="flex items-center gap-1.5">
                    <span class="text-[11px] text-pg-dim">
                        {t("draft.bans")}
                    </span>
                    <BanRow team={props.team} slotClass="w-4" class="gap-1" />
                </div>
            </div>
            <ul class="flex gap-2">
                <For each={SLOTS}>
                    {(index) => <StripSlot team={props.team} index={index} />}
                </For>
            </ul>
        </div>
    );
}

export function TeamStrip() {
    const { t } = useI18n();

    return (
        <section
            aria-label={t("pro.teams")}
            class="flex h-24 shrink-0 items-center justify-center gap-12 overflow-x-auto border-b border-pg-ln bg-pg-s1 px-4"
        >
            <StripTeam team={TEAMS[0]} />
            <span class="pt-4 text-xs font-semibold text-pg-dim">
                {t("pro.vs")}
            </span>
            <StripTeam team={TEAMS[1]} />
        </section>
    );
}
