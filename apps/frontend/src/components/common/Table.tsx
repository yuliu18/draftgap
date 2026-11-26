import { useI18n } from "../../contexts/I18nContext";
import { Table as TanstackTable, flexRender, Row } from "@tanstack/solid-table";
import { createVirtualizer } from "@tanstack/solid-virtual";
import { For, JSX, Show, createMemo } from "solid-js";
import { cn } from "../../utils/style";
import { ContextMenu, ContextMenuTrigger } from "./ContextMenu";

interface Props<T> {
    table: TanstackTable<T>;
    onClickRow?: (row: Row<T>, e: MouseEvent | KeyboardEvent) => void;
    rowClassName?: (row: Row<T>) => string;
    /** Context menu content (e.g. a `ContextMenuContent`) shown on right click of a row. */
    rowContextMenu?: (row: Row<T>) => JSX.Element;
    /** "pro" is the companion UI look (compact, 1px lines, design tokens). */
    variant?: "default" | "pro";
}

export function Table<T>(props: Props<T> & JSX.HTMLAttributes<HTMLDivElement>) {
    let tableEl: HTMLTableElement | undefined;
    const { t } = useI18n();
    const pro = () => props.variant === "pro";

    const rows = createMemo(() => props.table.getRowModel().rows);

    const rowVirtualizer = createVirtualizer<Element, Element>({
        getScrollElement: () => tableEl!,
        estimateSize: () => (props.variant === "pro" ? 56 : 57),
        get count() {
            return rows().length;
        },
        overscan: 10,
    });

    const virtualRows = createMemo(() => rowVirtualizer.getVirtualItems());

    const paddingTop = () =>
        virtualRows().length > 0 ? virtualRows()?.[0]?.start || 0 : 0;
    const paddingBottom = () =>
        virtualRows().length > 0
            ? rowVirtualizer.getTotalSize() -
              (virtualRows()?.[virtualRows().length - 1]?.end || 0)
            : 0;

    return (
        <div
            ref={tableEl}
            {...props}
            class={cn(
                "overflow-auto max-h-full max-w-full",
                !pro() && "rounded-md",
                props.class,
            )}
        >
            <table
                class={cn(
                    "min-w-full",
                    pro()
                        ? "border-collapse text-[13px] leading-4 tabular-nums"
                        : "text-lg md:text-xl lg:text-2xl",
                )}
                classList={{
                    "divide-y divide-neutral-700": !pro() && rows.length > 0,
                }}
            >
                <thead
                    class={cn(
                        "sticky top-0 z-1",
                        pro() ? "bg-pg-s1" : "bg-neutral-900",
                    )}
                >
                    <For each={props.table.getHeaderGroups()}>
                        {(headerGroup) => (
                            <tr>
                                <For each={headerGroup.headers}>
                                    {(header, i) => (
                                        <th
                                            scope="col"
                                            class={cn(
                                                pro()
                                                    ? "h-8 px-2 text-left text-[11px] font-medium text-pg-dim whitespace-nowrap border-b border-pg-ln transition-colors"
                                                    : "py-3 px-2 text-left font-normal uppercase w-full whitespace-nowrap transition-colors",
                                                {
                                                    "pl-4": i() === 0,
                                                    "pr-4":
                                                        i() ===
                                                        headerGroup.headers
                                                            .length -
                                                            1,
                                                    "hover:bg-neutral-800 cursor-default":
                                                        !pro() &&
                                                        header.column.getCanSort(),
                                                    "hover:text-pg-tx cursor-default":
                                                        pro() &&
                                                        header.column.getCanSort(),
                                                },
                                                (
                                                    header.column.columnDef
                                                        .meta as any
                                                )?.headerClass,
                                            )}
                                            onClick={header.column.getToggleSortingHandler()}
                                        >
                                            <div
                                                class="flex items-center gap-1"
                                                classList={{
                                                    "justify-end":
                                                        (
                                                            header.column
                                                                .columnDef
                                                                .meta as any
                                                        )?.align === "right",
                                                }}
                                            >
                                                {header.isPlaceholder
                                                    ? null
                                                    : flexRender(
                                                          header.column
                                                              .columnDef.header,
                                                          header.getContext(),
                                                      )}
                                                <Show
                                                    when={
                                                        header.column.getIsSorted() !==
                                                        false
                                                    }
                                                >
                                                    <span class="text-base mr-">
                                                        {
                                                            {
                                                                asc: " ▲",
                                                                desc: " ▼",
                                                            }[
                                                                header.column.getIsSorted() as string
                                                            ]
                                                        }
                                                    </span>
                                                </Show>
                                            </div>
                                        </th>
                                    )}
                                </For>
                            </tr>
                        )}
                    </For>
                </thead>
                <tbody
                    class={cn(
                        pro()
                            ? "bg-pg-s1"
                            : "divide-y divide-neutral-800 bg-primary",
                    )}
                >
                    <Show when={paddingTop() > 0}>
                        <tr>
                            <td style={{ height: `${paddingTop()}px` }} />
                        </tr>
                    </Show>
                    <For
                        each={rowVirtualizer
                            .getVirtualItems()
                            .map((i: any) => rows()[i.index])
                            .filter((r: any) => r)}
                    >
                        {(row) => (
                            <ContextMenu>
                                <ContextMenuTrigger
                                    as="tr"
                                    disabled={!props.rowContextMenu}
                                    class={cn(
                                        "transition duration-200 ease-out group/row",
                                        pro() &&
                                            "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-pg-ac",
                                    )}
                                    classList={{
                                        "hover:bg-neutral-800":
                                            !pro() && Boolean(props.onClickRow),
                                        "hover:bg-pg-s2":
                                            pro() && Boolean(props.onClickRow),
                                        [props.rowClassName?.(row) ?? ""]: true,
                                    }}
                                    onClick={(e) => props.onClickRow?.(row, e)}
                                    tabindex={props.onClickRow ? 0 : undefined}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                            props.onClickRow?.(row, e);
                                        }
                                    }}
                                >
                                    <For each={row.getVisibleCells()}>
                                        {(cell, i) => (
                                            <td
                                                class={cn(
                                                    pro()
                                                        ? "h-14 whitespace-nowrap px-2 border-b border-pg-ln group/cell transition-colors"
                                                        : "whitespace-nowrap py-3 px-2 group/cell transition-colors",
                                                    pro() &&
                                                        ((
                                                            cell.column
                                                                .columnDef
                                                                .meta as any
                                                        )?.align === "left"
                                                            ? "text-left"
                                                            : "text-right"),
                                                    {
                                                        "pl-4": i() === 0,
                                                        "pr-4":
                                                            i() ===
                                                            row.getVisibleCells()
                                                                .length -
                                                                1,
                                                        "hover:bg-neutral-800 cursor-default":
                                                            !pro() &&
                                                            Boolean(
                                                                (
                                                                    cell.column
                                                                        .columnDef
                                                                        .meta as any
                                                                )?.onClickCell,
                                                            ),
                                                    },
                                                    (
                                                        cell.column.columnDef
                                                            .meta as any
                                                    )?.cellClass,
                                                )}
                                                onClick={(e) =>
                                                    (
                                                        cell.column.columnDef
                                                            .meta as any
                                                    )?.onClickCell?.(
                                                        e,
                                                        cell.getContext(),
                                                    )
                                                }
                                            >
                                                {flexRender(
                                                    cell.column.columnDef.cell,
                                                    cell.getContext(),
                                                )}
                                            </td>
                                        )}
                                    </For>
                                </ContextMenuTrigger>
                                <Show when={props.rowContextMenu}>
                                    {props.rowContextMenu!(row)}
                                </Show>
                            </ContextMenu>
                        )}
                    </For>
                    <Show when={paddingBottom() > 0}>
                        <tr>
                            <td style={{ height: `${paddingBottom()}px` }} />
                        </tr>
                    </Show>
                    <Show when={rows().length === 0}>
                        <tr>
                            <td
                                class={
                                    pro()
                                        ? "py-6 px-2 text-center text-pg-dim"
                                        : "py-6 px-2 text-center uppercase text-lg text-neutral-500"
                                }
                                colspan="100%"
                            >
                                {t("common.noResults")}
                            </td>
                        </tr>
                    </Show>
                </tbody>
                <Show
                    when={props.table
                        .getFooterGroups()
                        .flatMap((g) => g.headers)
                        .some((h) => h.column.columnDef.footer)}
                >
                    <tfoot class="bg-neutral-900">
                        <For each={props.table.getFooterGroups()}>
                            {(footerGroup) => (
                                <tr>
                                    <For each={footerGroup.headers}>
                                        {(footer, i) => (
                                            <th
                                                scope="col"
                                                class={cn(
                                                    "py-3 px-2 text-left font-normal uppercase w-full",
                                                    {
                                                        "pl-4": i() === 0,
                                                        "pr-4":
                                                            i() ===
                                                            footerGroup.headers
                                                                .length -
                                                                1,
                                                    },
                                                    (
                                                        footer.column.columnDef
                                                            .meta as any
                                                    )?.footerClass,
                                                )}
                                            >
                                                {footer.isPlaceholder
                                                    ? null
                                                    : flexRender(
                                                          footer.column
                                                              .columnDef.footer,
                                                          footer.getContext(),
                                                      )}
                                            </th>
                                        )}
                                    </For>
                                </tr>
                            )}
                        </For>
                    </tfoot>
                </Show>
            </table>
        </div>
    );
}
