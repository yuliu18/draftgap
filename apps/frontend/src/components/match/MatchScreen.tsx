import { For, Match, Show, Switch, createMemo } from "solid-js";
import {
    inGameId,
    isInGamePhase,
    selectMatchup,
} from "@draftgap/core/src/scouting/match-view";
import {
    RankInfo,
    ScoutedPlayer,
} from "@draftgap/core/src/scouting/scouting-snapshot";
import { displayNameByRole } from "@draftgap/core/src/models/Role";
import { MessageKey } from "@draftgap/core/src/i18n/messages";
import {
    MatchupChatInput,
    matchupStatsFor,
} from "@draftgap/core/src/llm/matchup-chat";
import { useMedia } from "../../hooks/useMedia";
import { createMatchScouting } from "../../hooks/createMatchScouting";
import { useI18n } from "../../contexts/I18nContext";
import { useDataset } from "../../contexts/DatasetContext";
import { useUser } from "../../contexts/UserContext";
import { championName } from "../../utils/i18n";
import { formatPercent } from "../../utils/format";
import { ProPanel, ProPanelHead } from "../common/Pro";
import { ChampionIcon } from "../icons/ChampionIcon";
import { MatchupChatPanel } from "./MatchupChatPanel";

const emblemTiers = [
    "IRON",
    "BRONZE",
    "SILVER",
    "GOLD",
    "PLATINUM",
    "EMERALD",
    "DIAMOND",
    "MASTER",
    "GRANDMASTER",
    "CHALLENGER",
] as const;
const emblemBase =
    "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-emblem/emblem-";

function rankDisplay(rank: RankInfo, t: ReturnType<typeof useI18n>["t"]) {
    if (rank.status !== "ranked") return;
    const tier = emblemTiers.find((tier) => tier === rank.tier);
    return {
        label: [tier ? t(`match.tier.${tier}`) : rank.tier, rank.division]
            .filter(Boolean)
            .join(" "),
        points:
            rank.leaguePoints === undefined
                ? undefined
                : `${rank.leaguePoints} LP`,
        emblem: tier && `${emblemBase}${tier.toLowerCase()}.png`,
    };
}

function PlayerRank(props: { player: ScoutedPlayer }) {
    const { t } = useI18n();
    const solo = () => rankDisplay(props.player.solo, t);
    const flex = () => rankDisplay(props.player.flex, t);
    return (
        <div class="flex items-center gap-2">
            <Show when={solo()?.emblem}>
                {(url) => (
                    <span class="grid size-8 shrink-0 place-items-center overflow-hidden">
                        <img
                            class="size-8 scale-[2.3] object-contain"
                            src={url()}
                            alt=""
                        />
                    </span>
                )}
            </Show>
            <div>
                <div class="font-semibold">
                    {solo()?.label ??
                        t(
                            props.player.solo.status === "unranked"
                                ? "match.unranked"
                                : props.player.rankedFailed &&
                                    props.player.matchesFailed
                                  ? "match.hidden"
                                  : "match.noData",
                        )}
                    <Show when={solo()?.points}>
                        {(points) => (
                            <span class="ml-1 whitespace-nowrap text-[11px] font-normal text-pg-dim">
                                · {points()}
                            </span>
                        )}
                    </Show>
                </div>
                <Show when={flex()}>
                    {(rank) => (
                        <div class="text-[11px] text-pg-dim">
                            Flex · {rank().label}
                            {rank().points && ` · ${rank().points}`}
                        </div>
                    )}
                </Show>
            </div>
        </div>
    );
}

function GameState(props: { message: MessageKey }) {
    const { t } = useI18n();
    return (
        <p
            role="status"
            class="grid min-h-24 flex-1 place-items-center p-4 text-center text-pg-mu"
        >
            {t(props.message)}
        </p>
    );
}

export function MatchScreen() {
    const { t, localeTag, roleName } = useI18n();
    const { isDesktop } = useMedia();
    const { config } = useUser();
    const { dataset, dataset30Days } = useDataset();
    const { status, current, failed } = createMatchScouting(isDesktop);
    const activeGame = () => isInGamePhase(status()?.phase);
    const identifiedGame = () => {
        const game = status();
        return game && inGameId(game) !== undefined;
    };
    const snapshot = () => {
        const value = current()?.snapshot;
        return value?.status === "available" ? value : undefined;
    };
    const clientNotRunning = () => {
        const value = current()?.snapshot;
        return (
            status() === null ||
            (value?.status === "not_available" &&
                value.reason === "client_not_running")
        );
    };
    const lane = createMemo(() => selectMatchup(snapshot(), current()?.puuid));
    const championKeys = createMemo(
        () =>
            new Map(
                Object.keys(dataset()?.championData ?? {}).map((key) => [
                    Number(key),
                    key,
                ]),
            ),
    );
    const name = (key: string) =>
        championName(dataset()!.championData[key], config);
    function chatPick(player: ScoutedPlayer | undefined) {
        const key = championKeys().get(player?.championId ?? 0);
        return key && player?.role !== undefined
            ? { championKey: key, role: player.role }
            : undefined;
    }
    const myPick = () => chatPick(lane().me);
    const opponentPick = () => chatPick(lane().opponent);
    const chatRoster = createMemo(() => {
        const players = snapshot()?.players;
        const { me, opponent } = lane();
        if (!players || !me) return;
        const roster: NonNullable<MatchupChatInput["others"]> = {
            allies: [],
            enemies: [],
        };
        for (const player of players) {
            if (player === me || player === opponent) continue;
            const key = championKeys().get(player.championId ?? 0);
            if (!key) continue;
            const team =
                player.team === me.team ? roster.allies : roster.enemies;
            team.push({
                championName: name(key),
                role:
                    player.role === undefined
                        ? "unknown role"
                        : displayNameByRole[player.role],
            });
        }
        return roster;
    });
    const chatPlayers = createMemo<MatchupChatInput["players"]>(() => {
        const players = snapshot()?.players;
        const { me, opponent } = lane();
        if (!activeGame() || !players?.length || !me) return;
        const scoutedChampionName = (id?: number) => {
            const key = id === undefined ? undefined : championKeys().get(id);
            return key
                ? name(key)
                : id === undefined
                  ? "Unknown champion"
                  : `Champion ${id}`;
        };
        return players.map((player) => ({
            team: player.team === me.team ? "ally" : "enemy",
            laneOpponent: player === opponent,
            championName: scoutedChampionName(player.championId),
            solo: player.solo,
            recent: player.recent && {
                games: player.recent.games,
                wins: player.recent.wins,
                kda: player.recent.kda,
                topChampions: player.recent.topChampions.map(({ championId }) =>
                    scoutedChampionName(championId),
                ),
            },
        }));
    });
    const winrate = () => {
        const mine = myPick();
        const theirs = opponentPick();
        const data = dataset30Days();
        if (!mine || !theirs || !data) return;
        const { matchup } = matchupStatsFor(
            data,
            mine.championKey,
            mine.role,
            theirs.championKey,
            theirs.role,
        );
        return matchup.games
            ? formatPercent(matchup.wins / matchup.games, 1, localeTag())
            : undefined;
    };
    const teamOrder = () => (lane().me?.team === 2 ? [2, 1] : [1, 2]);
    const record = (player: ScoutedPlayer) =>
        player.recent &&
        t("match.record", {
            wins: player.recent.wins,
            losses: player.recent.games - player.recent.wins,
        });
    const teamTitle = (team: number) =>
        t(
            lane().me
                ? lane().me?.team === team
                    ? "match.ally"
                    : "match.enemy"
                : team === 1
                  ? "match.blue"
                  : "match.red",
        );
    const cell = "px-2 py-1 first:pl-4 last:pr-4";
    const playerDataState = (player: ScoutedPlayer) =>
        t(player.isBot ? "match.bot" : "match.noData");

    return (
        <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4 lg:flex-row">
            <ProPanel class="min-w-0 flex-1" aria-label={t("match.title")}>
                <ProPanelHead
                    title={t("match.title")}
                    aside={
                        snapshot() &&
                        t(
                            status()?.phase === "GameStart"
                                ? "match.loadingPhase"
                                : "match.live",
                        )
                    }
                />
                <Switch>
                    <Match when={!isDesktop}>
                        <GameState message="match.desktop" />
                    </Match>
                    <Match when={failed()}>
                        <GameState message="match.unavailable" />
                    </Match>
                    <Match when={clientNotRunning()}>
                        <GameState message="match.noClient" />
                    </Match>
                    <Match
                        when={
                            status() === undefined ||
                            (identifiedGame() && !current())
                        }
                    >
                        <GameState message="match.loading" />
                    </Match>
                    <Match when={!activeGame()}>
                        <GameState message="match.beforeGame" />
                    </Match>
                    <Match when={!snapshot()?.players.length}>
                        <GameState message="match.unavailable" />
                    </Match>
                    <Match when={snapshot()}>
                        <div class="overflow-auto">
                            <Show when={lane().opponent}>
                                {(rival) => (
                                    <div class="grid min-w-[640px] grid-cols-3 divide-x divide-pg-ln border-b border-pg-ln">
                                        <div class="px-4 py-2">
                                            <div class="text-[11px] text-pg-dim">
                                                {myPick() && opponentPick()
                                                    ? `${name(myPick()!.championKey)} vs ${name(opponentPick()!.championKey)}`
                                                    : t("matchupChat.title")}
                                            </div>
                                            <strong>
                                                {winrate()
                                                    ? `WR ${winrate()}`
                                                    : "—"}
                                            </strong>
                                        </div>
                                        <div class="px-4 py-2">
                                            <div class="text-[11px] text-pg-dim">
                                                {t("match.rival")}
                                            </div>
                                            <strong>
                                                {[
                                                    rankDisplay(rival().solo, t)
                                                        ?.label,
                                                    rankDisplay(rival().solo, t)
                                                        ?.points,
                                                ]
                                                    .filter(Boolean)
                                                    .join(" · ") ||
                                                    playerDataState(rival())}
                                            </strong>
                                        </div>
                                        <div class="px-4 py-2">
                                            <div class="text-[11px] text-pg-dim">
                                                {t("match.form")}
                                            </div>
                                            <strong>
                                                {record(rival()) ?? "—"}
                                            </strong>
                                        </div>
                                    </div>
                                )}
                            </Show>
                            <table class="w-full min-w-[640px] border-collapse text-left">
                                <thead>
                                    <tr class="h-8 border-b border-pg-ln text-[11px] text-pg-dim">
                                        <For
                                            each={
                                                [
                                                    "match.role",
                                                    "match.player",
                                                    "match.rank",
                                                    "match.winrate",
                                                    "match.form",
                                                    "match.mains",
                                                ] as const
                                            }
                                        >
                                            {(key, index) => (
                                                <th
                                                    scope="col"
                                                    class={`${cell} font-medium ${index() >= 3 ? "text-right" : ""}`}
                                                >
                                                    {t(key)}
                                                </th>
                                            )}
                                        </For>
                                    </tr>
                                </thead>
                                <For each={teamOrder()}>
                                    {(team) => (
                                        <tbody>
                                            <tr class="h-8 border-b border-pg-ln bg-pg-s2">
                                                <th
                                                    colSpan={6}
                                                    scope="rowgroup"
                                                    class={`${cell} text-[11px] font-semibold`}
                                                >
                                                    {teamTitle(team)}
                                                </th>
                                            </tr>
                                            <For
                                                each={snapshot()
                                                    ?.players.filter(
                                                        (p) => p.team === team,
                                                    )
                                                    .sort(
                                                        (a, b) =>
                                                            (a.role ?? 99) -
                                                            (b.role ?? 99),
                                                    )}
                                                fallback={
                                                    <tr>
                                                        <td
                                                            colSpan={6}
                                                            class={`${cell} h-11 text-pg-dim`}
                                                        >
                                                            {t("match.noData")}
                                                        </td>
                                                    </tr>
                                                }
                                            >
                                                {(player) => {
                                                    const key = () =>
                                                        championKeys().get(
                                                            player.championId ??
                                                                0,
                                                        );
                                                    const isMe = () =>
                                                        lane().me === player;
                                                    const isRival = () =>
                                                        lane().opponent ===
                                                        player;
                                                    return (
                                                        <tr
                                                            class="h-11 border-b border-pg-ln"
                                                            classList={{
                                                                "bg-pg-acb":
                                                                    isMe() ||
                                                                    isRival(),
                                                            }}
                                                        >
                                                            <td
                                                                class={`${cell} text-pg-dim`}
                                                            >
                                                                {player.role !==
                                                                undefined
                                                                    ? roleName(
                                                                          player.role,
                                                                      )
                                                                    : "—"}
                                                            </td>
                                                            <td class={cell}>
                                                                <div class="flex items-center gap-2">
                                                                    <Show
                                                                        when={key()}
                                                                        fallback={
                                                                            <span class="size-9 shrink-0 rounded border border-pg-ln2 bg-pg-s2" />
                                                                        }
                                                                    >
                                                                        {(
                                                                            id,
                                                                        ) => (
                                                                            <ChampionIcon
                                                                                championKey={id()}
                                                                                size={
                                                                                    36
                                                                                }
                                                                                class="shrink-0 border border-pg-ln2"
                                                                            />
                                                                        )}
                                                                    </Show>
                                                                    <div>
                                                                        <div class="font-semibold">
                                                                            {player.riotId ??
                                                                                (isMe()
                                                                                    ? t(
                                                                                          "match.you",
                                                                                      )
                                                                                    : playerDataState(
                                                                                          player,
                                                                                      ))}
                                                                        </div>
                                                                        <div class="text-[11px] text-pg-dim">
                                                                            {[
                                                                                key() &&
                                                                                    name(
                                                                                        key()!,
                                                                                    ),
                                                                                isMe() &&
                                                                                    player.riotId &&
                                                                                    t(
                                                                                        "match.you",
                                                                                    ),
                                                                                isRival() &&
                                                                                    t(
                                                                                        "match.rival",
                                                                                    ),
                                                                            ]
                                                                                .filter(
                                                                                    Boolean,
                                                                                )
                                                                                .join(
                                                                                    " · ",
                                                                                ) ||
                                                                                "—"}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td class={cell}>
                                                                <Show
                                                                    when={
                                                                        !player.isBot
                                                                    }
                                                                    fallback={t(
                                                                        "match.bot",
                                                                    )}
                                                                >
                                                                    <PlayerRank
                                                                        player={
                                                                            player
                                                                        }
                                                                    />
                                                                </Show>
                                                            </td>
                                                            <td
                                                                class={`${cell} text-right`}
                                                            >
                                                                <Show
                                                                    when={
                                                                        player
                                                                            .solo
                                                                            .status ===
                                                                            "ranked" &&
                                                                        player.solo
                                                                    }
                                                                    fallback={
                                                                        <span class="text-pg-dim">
                                                                            —
                                                                        </span>
                                                                    }
                                                                >
                                                                    {(rank) => (
                                                                        <>
                                                                            <div class="font-semibold">
                                                                                {rank()
                                                                                    .winrate ===
                                                                                undefined
                                                                                    ? "—"
                                                                                    : formatPercent(
                                                                                          rank()
                                                                                              .winrate!,
                                                                                          1,
                                                                                          localeTag(),
                                                                                      )}
                                                                            </div>
                                                                            <div class="whitespace-nowrap text-[11px] text-pg-dim">
                                                                                {t(
                                                                                    "match.games",
                                                                                    {
                                                                                        count:
                                                                                            rank()
                                                                                                .wins +
                                                                                            rank()
                                                                                                .losses,
                                                                                    },
                                                                                )}
                                                                            </div>
                                                                        </>
                                                                    )}
                                                                </Show>
                                                            </td>
                                                            <td
                                                                class={`${cell} text-right`}
                                                            >
                                                                <Show
                                                                    when={
                                                                        player.recent
                                                                    }
                                                                    fallback={
                                                                        <span class="text-[11px] text-pg-dim">
                                                                            {player.isBot
                                                                                ? "—"
                                                                                : t(
                                                                                      "match.noData",
                                                                                  )}
                                                                        </span>
                                                                    }
                                                                >
                                                                    {(
                                                                        recent,
                                                                    ) => (
                                                                        <span
                                                                            class="inline-flex gap-0.5"
                                                                            role="img"
                                                                            aria-label={record(
                                                                                player,
                                                                            )}
                                                                            title={record(
                                                                                player,
                                                                            )}
                                                                        >
                                                                            <For
                                                                                each={
                                                                                    recent()
                                                                                        .form
                                                                                }
                                                                            >
                                                                                {(
                                                                                    win,
                                                                                ) => (
                                                                                    <span
                                                                                        class={`h-4 w-2 rounded-[2px] ${win ? "bg-pg-pos" : "border border-pg-neg"}`}
                                                                                    />
                                                                                )}
                                                                            </For>
                                                                        </span>
                                                                    )}
                                                                </Show>
                                                            </td>
                                                            <td
                                                                class={`${cell} text-right`}
                                                            >
                                                                <div class="inline-flex gap-1">
                                                                    <For
                                                                        each={
                                                                            player
                                                                                .recent
                                                                                ?.topChampions
                                                                        }
                                                                        fallback={
                                                                            <span class="text-pg-dim">
                                                                                —
                                                                            </span>
                                                                        }
                                                                    >
                                                                        {(
                                                                            champ,
                                                                        ) => (
                                                                            <Show
                                                                                when={championKeys().get(
                                                                                    champ.championId,
                                                                                )}
                                                                            >
                                                                                {(
                                                                                    id,
                                                                                ) => (
                                                                                    <ChampionIcon
                                                                                        championKey={id()}
                                                                                        size={
                                                                                            32
                                                                                        }
                                                                                        title={`${name(id())} · ${t("match.games", { count: champ.games })}`}
                                                                                        class="border border-pg-ln2"
                                                                                    />
                                                                                )}
                                                                            </Show>
                                                                        )}
                                                                    </For>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                }}
                                            </For>
                                        </tbody>
                                    )}
                                </For>
                            </table>
                        </div>
                    </Match>
                </Switch>
            </ProPanel>
            <Show when={isDesktop}>
                <MatchupChatPanel
                    class="shrink-0 lg:w-[340px]"
                    me={myPick()}
                    opponent={opponentPick()}
                    roster={chatRoster()}
                    players={chatPlayers()}
                    phase={activeGame() ? "in-game" : "champ-select"}
                    loading={status()?.phase === "GameStart"}
                />
            </Show>
        </div>
    );
}
