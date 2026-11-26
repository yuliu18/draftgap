import {
    ColumnDef,
    createSolidTable,
    getCoreRowModel,
    getSortedRowModel,
    Row,
    SortingState,
} from "@tanstack/solid-table";
import { createSignal, For, JSXElement, Show } from "solid-js";
import { BanRoleThreat, BanSuggestion } from "@draftgap/core/src/draft/bans";
import { Role } from "@draftgap/core/src/models/Role";
import { useI18n } from "../../contexts/I18nContext";
import { useDraft } from "../../contexts/DraftContext";
import { useDataset } from "../../contexts/DatasetContext";
import { useDraftFilters } from "../../contexts/DraftFiltersContext";
import { useDraftSuggestions } from "../../contexts/DraftSuggestionsContext";
import { useUser } from "../../contexts/UserContext";
import { createTableKeyboardNavigation } from "../../hooks/createTableKeyboardNavigation";
import { championMatchesSearch } from "../../utils/search";
import { focusSearch } from "./Search";
import { createMustSelectToast } from "../../utils/toast";
import { formatPercentage } from "../../utils/rating";
import { tooltip } from "../../directives/tooltip";
import { Table } from "../common/Table";
import ChampionCell from "../common/ChampionCell";
import { RoleIcon } from "../icons/roles/RoleIcon";
import { ChampionContextMenuContent } from "./ChampionContextMenu";
// eslint-disable-next-line
tooltip;

const DISPLAY_EPSILON = 0.00005;

function formatPoints(value: number) {
    const sign =
        value > DISPLAY_EPSILON ? "+" : value < -DISPLAY_EPSILON ? "-" : "";
    return `${sign}${formatPercentage(Math.abs(value))}`;
}

function pointsClass(value: number) {
    if (value > DISPLAY_EPSILON) return "text-winrate-good";
    if (value < -DISPLAY_EPSILON) return "text-winrate-meh";
    return "text-neutral-400";
}

function HeaderWithTooltip(props: { label: string; tooltip: JSXElement }) {
    return (
        <span
            // @ts-ignore
            use:tooltip={{ content: props.tooltip }}
        >
            {props.label}
        </span>
    );
}

function ThreatBreakdown(props: { threats: BanRoleThreat[] }) {
    const { t, roleName } = useI18n();

    return (
        <div class="flex flex-col gap-1 text-base normal-case">
            <span class="text-neutral-400">{t("ban.threatTitle")}</span>
            <For each={props.threats}>
                {(threat) => (
                    <div class="flex items-center gap-2">
                        <RoleIcon role={threat.role} class="h-5" />
                        <span class="w-20">{roleName(threat.role)}</span>
                        <span class="w-24 text-neutral-400">
                            {t("ban.pickShort", {
                                value: formatPercentage(threat.probability, 1),
                            })}
                        </span>
                        <span class={`w-20 ${pointsClass(threat.delta)}`}>
                            {t("ban.wr", { value: formatPoints(threat.delta) })}
                        </span>
                        <span class={pointsClass(Math.max(0, threat.threat))}>
                            {formatPoints(Math.max(0, threat.threat))}
                        </span>
                    </div>
                )}
            </For>
        </div>
    );
}

const ROLE_ICON_SIZE = 32;

function ThreatRoles(props: { roles: Role[] }) {
    const secondaryRoles = () => props.roles.slice(1);
    const secondarySize = () =>
        ROLE_ICON_SIZE / Math.max(2, secondaryRoles().length);

    return (
        <div class="flex items-center gap-0.5">
            <RoleIcon
                role={props.roles[0]!}
                style={{ height: `${ROLE_ICON_SIZE}px` }}
            />
            <Show when={secondaryRoles().length > 0}>
                <div
                    class="flex flex-col justify-center"
                    style={{ height: `${ROLE_ICON_SIZE}px` }}
                >
                    <For each={secondaryRoles()}>
                        {(role) => (
                            <RoleIcon
                                role={role}
                                class="opacity-75"
                                style={{ height: `${secondarySize()}px` }}
                            />
                        )}
                    </For>
                </div>
            </Show>
        </div>
    );
}

export default function BanTable() {
    const { dataset } = useDataset();
    const { config } = useUser();
    const { selection, select, banChampion } = useDraft();
    const { search } = useDraftFilters();
    const { banSuggestions } = useDraftSuggestions();
    const { t } = useI18n();

    const filteredSuggestions = () => {
        let filtered = banSuggestions();

        if (search()) {
            filtered = filtered.filter((s) =>
                championMatchesSearch(
                    dataset()!.championData[s.championKey],
                    search(),
                    config,
                ),
            );
        }

        return filtered;
    };

    const mainThreat = (suggestion: BanSuggestion) => suggestion.threats[0]!;

    const columns: ColumnDef<BanSuggestion>[] = [
        {
            id: "role",
            header: () => (
                <HeaderWithTooltip
                    label={t("ban.col.roles")}
                    tooltip={t("ban.col.roles.tip")}
                />
            ),
            accessorFn: (suggestion) => mainThreat(suggestion).role,
            cell: (info) => (
                <ThreatRoles
                    roles={info.row.original.threats.map((t) => t.role)}
                />
            ),
            meta: {
                headerClass: "w-1",
            },
            sortDescFirst: false,
        },
        {
            id: "champion",
            header: () => t("draft.col.champion"),
            accessorFn: (suggestion) => suggestion.championKey,
            cell: (info) => (
                <ChampionCell championKey={info.getValue<string>()} />
            ),
            sortingFn: (a, b, id) =>
                dataset()!.championData[
                    a.getValue<string>(id)
                ].name.localeCompare(
                    dataset()!.championData[b.getValue<string>(id)].name,
                ),
        },
        {
            id: "pickrate",
            header: () => (
                <HeaderWithTooltip
                    label={t("ban.col.pickrate")}
                    tooltip={t("ban.col.pickrate.tip")}
                />
            ),
            accessorFn: (suggestion) => mainThreat(suggestion).probability,
            cell: (info) => (
                <div class="flex justify-end text-neutral-300">
                    {formatPercentage(info.getValue<number>(), 1)}
                </div>
            ),
        },
        {
            id: "delta",
            header: () => (
                <HeaderWithTooltip
                    label={t("ban.col.winrate")}
                    tooltip={t("ban.col.winrate.tip")}
                />
            ),
            accessorFn: (suggestion) => mainThreat(suggestion).delta,
            cell: (info) => (
                <div
                    class={`flex justify-end ${pointsClass(info.getValue<number>())}`}
                    style={{ "font-variant-numeric": "tabular-nums" }}
                >
                    {formatPoints(info.getValue<number>())}
                </div>
            ),
        },
        {
            id: "score",
            header: () => (
                <HeaderWithTooltip
                    label={t("ban.col.value")}
                    tooltip={t("ban.col.value.tip")}
                />
            ),
            accessorFn: (suggestion) => suggestion.score,
            cell: (info) => (
                <div
                    class={`flex justify-end ${pointsClass(info.getValue<number>())}`}
                    style={{ "font-variant-numeric": "tabular-nums" }}
                >
                    <span
                        // @ts-ignore
                        use:tooltip={{
                            content: (
                                <ThreatBreakdown
                                    threats={info.row.original.threats}
                                />
                            ),
                        }}
                    >
                        {formatPoints(info.getValue<number>())}
                    </span>
                </div>
            ),
        },
    ];

    const [sorting, setSorting] = createSignal<SortingState>([]);
    const table = createSolidTable({
        get data() {
            return filteredSuggestions();
        },
        columns,
        state: {
            get sorting() {
                return sorting();
            },
        },
        onSortingChange: setSorting,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
    });

    function ban(row: Row<BanSuggestion>, e: MouseEvent | KeyboardEvent) {
        if (!selection.team) {
            createMustSelectToast(t);
            return;
        }

        banChampion(selection.team, selection.index, row.original.championKey);

        if (e instanceof KeyboardEvent) {
            focusSearch();
        }
    }

    createTableKeyboardNavigation("ban-table", (team) =>
        select(team, undefined, { type: "ban" }),
    );

    return (
        <Table
            table={table}
            onClickRow={ban}
            rowContextMenu={(row) => (
                <ChampionContextMenuContent
                    championKey={row.original.championKey}
                    role={mainThreat(row.original).role}
                />
            )}
            id="ban-table"
        />
    );
}
