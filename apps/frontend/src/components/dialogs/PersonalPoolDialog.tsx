import {
    ColumnDef,
    createSolidTable,
    getCoreRowModel,
    getSortedRowModel,
} from "@tanstack/solid-table";
import { Show, createMemo } from "solid-js";
import { Role } from "@draftgap/core/src/models/Role";
import { PersonalPickStats } from "@draftgap/core/src/personal/personal-stats";
import { DialogContent, DialogHeader, DialogTitle } from "../common/Dialog";
import { Table } from "../common/Table";
import ChampionCell from "../common/ChampionCell";
import { RoleCell } from "../common/RoleCell";
import { RatingText } from "../common/RatingText";
import { usePersonal } from "../../contexts/PersonalContext";
import { useDataset } from "../../contexts/DatasetContext";
import { winrateToRating } from "@draftgap/core/src/rating/ratings";
import { formatPercentage } from "../../utils/rating";
import { useI18n } from "../../contexts/I18nContext";

const winrate = (games: number, wins: number) =>
    games === 0 ? undefined : wins / games;

export function PersonalPoolDialog() {
    const { stats } = usePersonal();
    const { t, localeTag } = useI18n();
    const { dataset } = useDataset();

    const picks = createMemo(() =>
        Object.values(stats().byPick).sort(
            (a, b) => b.games - a.games || b.lastPlayed - a.lastPlayed,
        ),
    );

    const columns: ColumnDef<PersonalPickStats>[] = [
        {
            header: t("pool.col.role"),
            accessorFn: (pick) => pick.role,
            cell: (info) => <RoleCell role={info.getValue<Role>()} />,
            meta: { headerClass: "w-1" },
        },
        {
            header: t("pool.col.champion"),
            accessorFn: (pick) => pick.championKey,
            cell: (info) => (
                <Show
                    when={dataset()?.championData[info.getValue<string>()]}
                    fallback={<span>{info.getValue<string>()}</span>}
                >
                    <ChampionCell championKey={info.getValue<string>()} />
                </Show>
            ),
        },
        {
            header: t("pool.col.games"),
            accessorFn: (pick) => pick.games,
            cell: (info) => (
                <div class="flex justify-end">{info.getValue<number>()}</div>
            ),
        },
        {
            header: t("pool.col.wins"),
            accessorFn: (pick) => pick.wins,
            cell: (info) => (
                <div class="flex justify-end">{info.getValue<number>()}</div>
            ),
        },
        {
            header: t("pool.col.winrate"),
            accessorFn: (pick) => pick.wins / pick.games,
            cell: (info) => (
                <div class="flex justify-end">
                    <RatingText
                        rating={winrateToRating(info.getValue<number>())}
                    />
                </div>
            ),
        },
        {
            header: t("pool.col.lastPlayed"),
            accessorFn: (pick) => pick.lastPlayed,
            cell: (info) => (
                <div class="flex justify-end">
                    {new Date(info.getValue<number>()).toLocaleDateString(
                        localeTag(),
                    )}
                </div>
            ),
        },
    ];

    const table = createSolidTable({
        get data() {
            return picks();
        },
        columns,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
    });

    const format = (games: number, wins: number) => {
        const wr = winrate(games, wins);
        return `${wins}/${games}${wr === undefined ? "" : ` (${formatPercentage(wr, 1)}%)`}`;
    };

    return (
        <DialogContent class="max-w-3xl">
            <DialogHeader>
                <DialogTitle>{t("pool.title")}</DialogTitle>
            </DialogHeader>
            <div class="flex gap-8 text-lg uppercase">
                <span>
                    {t("pool.overall", {
                        value: format(stats().games, stats().wins),
                    })}
                </span>
                <span>
                    {t("pool.recent", {
                        value: format(
                            stats().recent.games,
                            stats().recent.wins,
                        ),
                    })}
                </span>
            </div>
            <Show
                when={picks().length > 0}
                fallback={
                    <span class="text-neutral-400">{t("pool.empty")}</span>
                }
            >
                <Table table={table} class="max-h-[60vh]" />
            </Show>
        </DialogContent>
    );
}
