import {
    ColumnDef,
    createSolidTable,
    getCoreRowModel,
    getSortedRowModel,
    Row,
    SortingState,
} from "@tanstack/solid-table";
import { useDraft } from "../../contexts/DraftContext";
import { useI18n } from "../../contexts/I18nContext";
import { Role } from "@draftgap/core/src/models/Role";
import { Suggestion } from "@draftgap/core/src/draft/suggestions";
import { ratingToWinrate } from "@draftgap/core/src/rating/ratings";
import { PersonalizedSuggestion } from "@draftgap/core/src/personal/personalize";
import { tooltip } from "../../directives/tooltip";
import { Table } from "../common/Table";
import { ProBar, ProButton } from "../common/Pro";
import { ChampionIcon } from "../icons/ChampionIcon";
import {
    createEffect,
    createMemo,
    createSignal,
    onCleanup,
    Show,
    untrack,
} from "solid-js";
import { Icon } from "solid-heroicons";
import { star } from "solid-heroicons/solid";
import { star as starOutline } from "solid-heroicons/outline";
import { createMustSelectToast } from "../../utils/toast";
import { useUser } from "../../contexts/UserContext";
import { useDraftSuggestions } from "../../contexts/DraftSuggestionsContext";
import { useDataset } from "../../contexts/DatasetContext";
import { useDraftFilters } from "../../contexts/DraftFiltersContext";
import { informationCircle } from "solid-heroicons/solid-mini";
import { Dialog } from "../common/Dialog";
import { ChampionDraftAnalysisDialog } from "../dialogs/ChampionDraftAnalysisDialog";
import { Team } from "@draftgap/core/src/models/Team";
import { championMatchesSearch } from "../../utils/search";
import { focusSearch } from "./Search";
import { championName, championSortName } from "../../utils/i18n";
import { getLaneMatchup } from "../../utils/lane-matchup";
import { formatPercent, formatSigned, signClass } from "../../utils/format";
import { useOpenBuild } from "../../hooks/useOpenBuild";
import { createTableKeyboardNavigation } from "../../hooks/createTableKeyboardNavigation";
import { ChampionContextMenuContent } from "./ChampionContextMenu";
import {
    PreviewDraftAnalysisProvider,
    PreviewPick,
    useDraftAnalysis,
} from "../../contexts/DraftAnalysisContext";

// eslint-disable-next-line
tooltip;

function PreviewDialogContent(props: { pick: PreviewPick }) {
    // Champion shown in the dialog; starts at the previewed champion and can
    // change when clicking matchups/duos inside the dialog.
    const [shown, setShown] = createSignal<{
        team: Team;
        championKey: string;
    }>(
        untrack(() => ({
            team: props.pick.team,
            championKey: props.pick.championKey,
        })),
    );

    return (
        <ChampionDraftAnalysisDialog
            team={shown().team}
            championKey={shown().championKey}
            openChampionDraftAnalysisModal={(team, championKey) =>
                setShown({ team, championKey })
            }
        />
    );
}

export default function DraftTable() {
    const { dataset } = useDataset();
    const {
        selection,
        selectedChampionKey,
        pickChampion,
        select,
        allBans,
        ownedChampions,
    } = useDraft();
    const {
        allyTeamComp,
        opponentTeamComp,
        allySuggestionTeamComp,
        opponentSuggestionTeamComp,
    } = useDraftAnalysis();
    const { dataset30Days } = useDataset();
    const {
        search,
        roleFilter,
        favouriteFilter,
        poolFilter,
        setDisplayedSuggestions,
    } = useDraftFilters();
    const { allySuggestions, opponentSuggestions } = useDraftSuggestions();
    const { isFavourite, setFavourite, config } = useUser();
    const { t, roleName, localeTag } = useI18n();
    const openBuild = useOpenBuild();

    const suggestions = () =>
        selection.team === "opponent"
            ? opponentSuggestions()
            : allySuggestions();

    const ownsChampion = (championKey: string) =>
        // If we don't have owned champions, we are not logged in, so we own all champions.
        ownedChampions().size === 0 || ownedChampions().has(championKey);

    const filteredSuggestions = () => {
        let filtered = suggestions();
        if (!dataset()) {
            return filtered;
        }

        if (search()) {
            filtered = filtered.filter((s) =>
                championMatchesSearch(
                    dataset()!.championData[s.championKey],
                    search(),
                    config,
                ),
            );
        }

        if (roleFilter() !== undefined) {
            filtered = filtered.filter((s) => s.role === roleFilter());
        }

        if (favouriteFilter()) {
            filtered = filtered.filter((s) =>
                isFavourite(s.championKey, s.role),
            );
        }

        if (poolFilter()) {
            filtered = filtered.filter(
                (s) =>
                    ((s as Partial<PersonalizedSuggestion>).personal?.games ??
                        0) > 0,
            );
        }

        if (config.showFavouritesAtTop) {
            // Sort is normally in place, but then tanstack table does not see the update.
            filtered = [...filtered].sort((a, b) => {
                const aFav = isFavourite(a.championKey, a.role);
                const bFav = isFavourite(b.championKey, b.role);
                if (aFav && !bFav) {
                    return -1;
                } else if (!aFav && bFav) {
                    return 1;
                } else {
                    return 0;
                }
            });
        }

        if (config.banPlacement === "hidden") {
            filtered = filtered.filter((s) => !allBans().has(s.championKey));
        } else if (config.banPlacement === "bottom") {
            filtered = [...filtered].sort((a, b) => {
                const aBanned = allBans().has(a.championKey);
                const bBanned = allBans().has(b.championKey);
                if (aBanned && !bBanned) {
                    return 1;
                } else if (!aBanned && bBanned) {
                    return -1;
                } else {
                    return 0;
                }
            });
        }

        if (config.unownedPlacement === "hidden") {
            filtered = filtered.filter((s) => ownsChampion(s.championKey));
        } else if (config.unownedPlacement === "bottom") {
            filtered = [...filtered].sort((a, b) => {
                const aUnowned = !ownsChampion(a.championKey);
                const bUnowned = !ownsChampion(b.championKey);
                if (aUnowned && !bUnowned) {
                    return 1;
                } else if (!aUnowned && bUnowned) {
                    return -1;
                } else {
                    return 0;
                }
            });
        }

        return filtered;
    };

    // Role the champion in the selected slot is currently played in, so only
    // that row is highlighted instead of every role of the champion.
    const selectedChampionRole = () => {
        const key = selectedChampionKey();
        if (!key) return undefined;
        const comp =
            selection.team === "opponent" ? opponentTeamComp() : allyTeamComp();
        return [...comp.entries()].find(([, k]) => k === key)?.[0];
    };

    const isSelectedChampion = (suggestion: Suggestion) => {
        if (suggestion.championKey !== selectedChampionKey()) return false;
        const role = selectedChampionRole();
        return role === undefined || suggestion.role === role;
    };

    const [previewPick, setPreviewPick] = createSignal<PreviewPick>();
    const [showPreview, setShowPreview] = createSignal(false);

    function openPreview(championKey: string, role: Role | undefined) {
        if (!selection.team) return;
        setPreviewPick({
            team: selection.team,
            index: selection.index,
            championKey,
            role,
        });
        setShowPreview(true);
    }

    // The team the rows are for faces the other one.
    const enemyComp = () =>
        selection.team === "opponent"
            ? allySuggestionTeamComp()
            : opponentSuggestionTeamComp();

    const laneMatchup = (suggestion: Suggestion) =>
        getLaneMatchup(suggestion, enemyComp(), dataset30Days());

    const personalOf = (suggestion: Suggestion) =>
        (suggestion as Partial<PersonalizedSuggestion>).personal;

    // Personal columns only show when some row has games of the player's own.
    const hasPersonal = createMemo(() =>
        suggestions().some((s) => (personalOf(s)?.games ?? 0) > 0),
    );

    // Header of the lane column: the opponent in the one role on display.
    const laneOpponentName = createMemo(() => {
        const roles = new Set(filteredSuggestions().map((s) => s.role));
        if (roles.size !== 1) return undefined;
        const key = enemyComp().get([...roles][0]);
        const champion = key ? dataset()?.championData[key] : undefined;
        return champion ? championName(champion, config) : undefined;
    });

    const columns: () => ColumnDef<Suggestion>[] = () => [
        {
            id: "rank",
            header: () => t("pro.col.rank"),
            accessorFn: (suggestion) => suggestion,
            cell: (info) => (
                <span class="text-pg-dim">
                    {table
                        .getRowModel()
                        .rows.findIndex((r) => r.id === info.row.id) + 1}
                </span>
            ),
            meta: { align: "left", headerClass: "w-8" },
            enableSorting: false,
        },
        {
            id: "champion",
            header: () => t("pro.col.champion"),
            accessorFn: (suggestion) => suggestion.championKey,
            cell: (info) => {
                const champion = () =>
                    dataset()!.championData[info.getValue<string>()];
                const favourite = () =>
                    isFavourite(
                        info.row.original.championKey,
                        info.row.original.role,
                    );
                return (
                    <span class="flex items-center gap-3">
                        <span class="overflow-hidden rounded border border-pg-ln2">
                            <ChampionIcon
                                championKey={info.getValue<string>()}
                                size={38}
                                class="rounded-none"
                            />
                        </span>
                        <span class="text-left">
                            <span class="flex items-center gap-1 font-semibold">
                                {championName(champion(), config)}
                                <button
                                    type="button"
                                    tabIndex={-1}
                                    aria-pressed={favourite()}
                                    aria-label={
                                        favourite()
                                            ? t("draft.unfavourite")
                                            : t("draft.favourite")
                                    }
                                    class="transition-opacity"
                                    classList={{
                                        "opacity-0 group-hover/row:opacity-40 hover:opacity-100!":
                                            !favourite(),
                                        "opacity-60": favourite(),
                                    }}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setFavourite(
                                            info.row.original.championKey,
                                            info.row.original.role,
                                            !favourite(),
                                        );
                                    }}
                                >
                                    <Icon
                                        path={favourite() ? star : starOutline}
                                        class="size-3.5"
                                    />
                                </button>
                            </span>
                            <span class="block text-[11px] text-pg-dim">
                                {roleName(info.row.original.role)}
                            </span>
                        </span>
                    </span>
                );
            },
            meta: { align: "left" },
            sortingFn: (a, b, id) =>
                championSortName(
                    dataset()!.championData[a.getValue<string>(id)],
                    dataset()!.championData[b.getValue<string>(id)],
                    config,
                ),
        },
        ...(config.showAdvancedWinrates
            ? ([
                  {
                      id: "champions",
                      header: () => t("draft.col.champions"),
                      accessorFn: (suggestion) =>
                          suggestion.draftResult.allyChampionRating.totalRating,
                      cell: (info) => (
                          <span class="font-semibold">
                              {formatPercent(
                                  ratingToWinrate(info.getValue<number>()),
                                  1,
                                  localeTag(),
                              )}
                          </span>
                      ),
                      meta: { align: "right" },
                  },
                  {
                      id: "matchups",
                      header: () => t("draft.col.matchups"),
                      accessorFn: (suggestion) =>
                          suggestion.draftResult.matchupRating.totalRating,
                      cell: (info) => (
                          <span class="font-semibold">
                              {formatPercent(
                                  ratingToWinrate(info.getValue<number>()),
                                  1,
                                  localeTag(),
                              )}
                          </span>
                      ),
                      meta: { align: "right" },
                  },
                  {
                      id: "duos",
                      header: () => t("draft.col.duos"),
                      accessorFn: (suggestion) =>
                          suggestion.draftResult.allyDuoRating.totalRating,
                      cell: (info) => (
                          <span class="font-semibold">
                              {formatPercent(
                                  ratingToWinrate(info.getValue<number>()),
                                  1,
                                  localeTag(),
                              )}
                          </span>
                      ),
                      meta: { align: "right" },
                  },
              ] as ColumnDef<Suggestion>[])
            : []),
        {
            id: "winrate",
            header: () => t("pro.col.wr"),
            accessorFn: (suggestion) =>
                (suggestion as Partial<PersonalizedSuggestion>)
                    .personalRating ?? suggestion.draftResult.totalRating,
            cell: (info) => (
                <span class="font-semibold">
                    {formatPercent(
                        ratingToWinrate(info.getValue<number>()),
                        1,
                        localeTag(),
                    )}
                </span>
            ),
            meta: { align: "right" },
        },
        ...(hasPersonal()
            ? ([
                  {
                      id: "personal",
                      header: () => t("pro.col.personal"),
                      accessorFn: (suggestion) => {
                          const personal = personalOf(suggestion);
                          return personal?.games
                              ? personal.wins / personal.games
                              : -1;
                      },
                      cell: (info) => (
                          <Show when={personalOf(info.row.original)?.games}>
                              <span
                                  class="inline-flex w-[72px] flex-col items-end gap-1"
                                  // @ts-ignore
                                  use:tooltip={{
                                      content: t("draft.personalTip", {
                                          games: personalOf(info.row.original)!
                                              .games,
                                          wins: personalOf(info.row.original)!
                                              .wins,
                                          rating: formatSigned(
                                              personalOf(info.row.original)!
                                                  .rating,
                                              1,
                                              localeTag(),
                                          ),
                                          mastery: personalOf(
                                              info.row.original,
                                          )!.masteryRating.toFixed(1),
                                          familiarity: personalOf(
                                              info.row.original,
                                          )!.familiarityRating.toFixed(1),
                                      }),
                                  }}
                              >
                                  <span class="font-semibold">
                                      {personalOf(info.row.original)!.wins}/
                                      {personalOf(info.row.original)!.games}
                                  </span>
                                  <ProBar
                                      class="w-[72px]"
                                      value={
                                          personalOf(info.row.original)!.wins /
                                          personalOf(info.row.original)!.games
                                      }
                                  />
                              </span>
                          </Show>
                      ),
                      meta: { align: "right" },
                  },
                  {
                      id: "personalDelta",
                      header: () => t("pro.col.personalDelta"),
                      accessorFn: (suggestion) =>
                          personalOf(suggestion)?.games
                              ? personalOf(suggestion)!.rating
                              : -Infinity,
                      cell: (info) => (
                          <Show when={personalOf(info.row.original)?.games}>
                              <span
                                  class={`font-semibold ${signClass(personalOf(info.row.original)!.rating)}`}
                              >
                                  {formatSigned(
                                      personalOf(info.row.original)!.rating,
                                      1,
                                      localeTag(),
                                  )}
                              </span>
                          </Show>
                      ),
                      meta: { align: "right" },
                  },
              ] as ColumnDef<Suggestion>[])
            : []),
        {
            id: "lane",
            header: () =>
                laneOpponentName()
                    ? t("pro.col.vs", { name: laneOpponentName()! })
                    : t("pro.col.vsLane"),
            accessorFn: (suggestion) =>
                laneMatchup(suggestion)?.delta ?? -Infinity,
            cell: (info) => {
                const delta = () => laneMatchup(info.row.original)?.delta;
                return (
                    <Show
                        when={delta() !== undefined}
                        fallback={<span class="text-pg-dim">—</span>}
                    >
                        <span class={`font-semibold ${signClass(delta())}`}>
                            {formatSigned(delta()!, 1, localeTag())}
                        </span>
                    </Show>
                );
            },
            meta: { align: "right" },
        },
        {
            id: "actions",
            header: () => <span class="sr-only">{t("pro.col.action")}</span>,
            cell: (info) => (
                <span class="flex items-center justify-end gap-2">
                    <button
                        type="button"
                        aria-label={t("draft.preview")}
                        onClick={(e) => {
                            e.stopPropagation();
                            openPreview(
                                info.row.original.championKey,
                                info.row.original.role,
                            );
                        }}
                        class="text-pg-mu opacity-40 transition-opacity hover:opacity-100"
                    >
                        <Icon path={informationCircle} class="size-4" />
                    </button>
                    <ProButton
                        size="sm"
                        aria-label={t("pro.buildOf", {
                            name: championName(
                                dataset()!.championData[
                                    info.row.original.championKey
                                ],
                                config,
                            ),
                        })}
                        onClick={(e: MouseEvent) => {
                            e.stopPropagation();
                            openBuild(
                                info.row.original.championKey,
                                info.row.original.role,
                            );
                        }}
                    >
                        {t("pro.build")}
                    </ProButton>
                </span>
            ),
            meta: { align: "right" },
            enableSorting: false,
        },
    ];

    const [sorting, setSorting] = createSignal<SortingState>([]);
    const table = createSolidTable({
        get data() {
            return filteredSuggestions();
        },
        get columns() {
            return columns();
        },
        state: {
            get sorting() {
                return sorting();
            },
        },
        onSortingChange: setSorting,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
    });

    function pick(row: Row<Suggestion>, e: MouseEvent | KeyboardEvent) {
        if (!selection.team) {
            createMustSelectToast(t);
            return;
        }

        pickChampion(
            selection.team,
            selection.index,
            row.original.championKey,
            row.original.role,
        );

        if (e instanceof KeyboardEvent) {
            focusSearch();
        }
    }

    createTableKeyboardNavigation("draft-table", (team) => select(team));

    // Rows in the order they are displayed (filters and sorting applied),
    // shared with the panels around the table.
    createEffect(() =>
        setDisplayedSuggestions(
            table.getRowModel().rows.map((row) => row.original),
        ),
    );
    onCleanup(() => setDisplayedSuggestions([]));

    return (
        <>
            <Table
                variant="pro"
                table={table}
                onClickRow={pick}
                rowClassName={(r) =>
                    isSelectedChampion(r.original)
                        ? "bg-pg-acb!"
                        : allBans().has(r.original.championKey) ||
                            !ownsChampion(r.original.championKey)
                          ? "opacity-30"
                          : ""
                }
                rowContextMenu={(row) => (
                    <ChampionContextMenuContent
                        championKey={row.original.championKey}
                        role={row.original.role}
                        onAnalysis={
                            selection.team
                                ? () =>
                                      openPreview(
                                          row.original.championKey,
                                          row.original.role,
                                      )
                                : undefined
                        }
                    />
                )}
                id="draft-table"
                class="min-h-0 flex-1"
            />
            <Dialog open={showPreview()} onOpenChange={setShowPreview}>
                <Show when={previewPick()} keyed>
                    {(pick) => (
                        <PreviewDraftAnalysisProvider pick={pick}>
                            <PreviewDialogContent pick={pick} />
                        </PreviewDraftAnalysisProvider>
                    )}
                </Show>
            </Dialog>
        </>
    );
}
