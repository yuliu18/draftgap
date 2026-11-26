import "@tanstack/solid-table";

declare module "@tanstack/table-core" {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    interface ColumnMeta<TData extends RowData, TValue> {
        headerClass?: string;
        /** Alignment of the column in the pro table (default left for headers). */
        align?: "left" | "right";
    }
}
