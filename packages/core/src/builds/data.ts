import {
    FetchQueryOptions,
    QueryClient,
    QueryOptions,
} from "@tanstack/query-core";
import { getLolalyticsChampion } from "../../../../apps/dataset/src/lolalytics/champion";
import {
    LOLALYTICS_ROLES,
    LolalyticsRole,
} from "../../../../apps/dataset/src/lolalytics/roles";
import { Role } from "../models/Role";
import {
    FullBuildDataset,
    ItemsBuildData,
    PartialBuildDataset,
    RunesBuildData,
    Skill,
    SkillOrder,
    SkillsBuildData,
    SummonerSpellsBuildData,
} from "../models/build/BuildDataset";
import { Dataset } from "../models/dataset/Dataset";
import { EntityStats } from "./entity-analysis";
import {
    BuildSourceData,
    PageFetcher,
    getLolalyticsPageBuildSource,
} from "./lolalytics-page";

// `BuildSourceData` is what this file reads from a champion's statistics. The
// legacy `LolalyticsChampionResponse` (ax.lolalytics.com) and the Lolalytics
// page adapter both fit it.

function getRunesBuildData(dataset: Dataset, championData: BuildSourceData) {
    const runes: RunesBuildData = {
        primary: {},
        secondary: {},
        shards: {
            offense: {},
            defense: {},
            flex: {},
        },
    };

    for (const [rawId, runesArray] of Object.entries(
        championData.runes.stats,
    )) {
        // Rune or Shard ID
        const runeId = parseInt(rawId);
        // Whether this shard is in the flex slot (slot 1)
        const isFlexShard = rawId.at(-1) === "f";

        for (const [i, rune] of runesArray.map(
            (rune, i) => [i, rune] as const,
        )) {
            const [, winRate, games] = rune;
            const chosenAsSecondary = i === 1;

            const runeStats = {
                wins: Math.round(games * (winRate / 100)),
                games,
            } satisfies EntityStats;

            if (dataset.runeData[runeId]) {
                if (chosenAsSecondary) {
                    runes.secondary[runeId] = runeStats;
                } else {
                    runes.primary[runeId] = runeStats;
                }
            } else if (dataset.statShardData[runeId]) {
                if (isFlexShard) {
                    runes.shards.flex[runeId] = runeStats;
                } else {
                    const slot = dataset.statShardData[runeId].positions.find(
                        (p) => p.slot !== 1,
                    )?.slot;
                    if (slot === undefined) {
                        throw new Error(
                            "Shard has no slot other than flex " + runeId,
                        );
                    }
                    if (slot === 0) {
                        runes.shards.offense[runeId] = runeStats;
                    } else if (slot === 2) {
                        runes.shards.defense[runeId] = runeStats;
                    }
                }
            }
            // A rune or shard the dataset does not know (for example one added
            // after the dataset was built) is left out instead of failing the
            // whole build.
        }
    }

    return runes;
}

function getItemsBuildData(championData: BuildSourceData) {
    const oneToFive = [1, 2, 3, 4, 5] as const;

    const items: ItemsBuildData = {
        boots: {},
        startingSets: {},
        sets: {},
        statsByOrder: oneToFive.map(() => ({})),
    };

    const parseItem = (itemData: BuildSourceData["item1"][0]) => {
        const id = itemData[0];
        const winrate = itemData[1] / 100;
        const games = itemData[3];
        const wins = Math.round(games * winrate);
        return [id, { wins, games }] as const;
    };

    const parseSet = (setData: BuildSourceData["startSet"][0]) => {
        let setItems: number[];
        if (typeof setData[0] === "number") {
            setItems = [setData[0]];
        } else {
            setItems = setData[0].split("_").map((id) => parseInt(id));
        }
        const winrate = setData[1] / 100;
        const games = setData[3];
        const wins = Math.round(games * winrate);
        return [setItems, { wins, games }] as const;
    };

    // Boots
    for (const itemData of championData.boots) {
        const [id, stats] = parseItem(itemData);
        // Skip no boots, magical footwear and base boots.
        if ([9999, 2422, 1001].includes(id)) {
            continue;
        }
        items.boots[id] = stats;
    }

    // Starting items
    for (const setData of championData.startSet) {
        const [setItems, stats] = parseSet(setData);
        items.startingSets[setItems.sort().join("_")] = stats;
    }

    // Items
    for (const n of oneToFive) {
        const order = n - 1;
        const orderItems = championData[`item${n}`] ?? [];
        for (const itemData of orderItems) {
            const [id, stats] = parseItem(itemData);
            items.statsByOrder[order][id] = stats;
        }
    }

    return items;
}

function getSummonerSpellsBuildData(championData: BuildSourceData) {
    const summonerSpells = {} as SummonerSpellsBuildData;

    const parseSummonerSpellSet = (
        summonerSpellData: BuildSourceData["spells"][number],
    ) => {
        const id = summonerSpellData[0];
        const winrate = summonerSpellData[1] / 100;
        const games = summonerSpellData[3];
        const wins = Math.round(games * winrate);

        return [id, { wins, games }] as const;
    };

    for (const spellSetData of championData.spells) {
        const [spellSet, stats] = parseSummonerSpellSet(spellSetData);
        // Sort the spell set so that the order of the spells doesn't matter.
        const spellSetNormalized = spellSet.split("_").sort().join("_");
        summonerSpells[spellSetNormalized] = stats;
    }

    return summonerSpells;
}

function getSkillsBuildData(championData: BuildSourceData) {
    const skills = {
        order: {},
        level: {},
    } as SkillsBuildData;

    const parseSkillOrder = (
        skillOrderData: BuildSourceData["skills"]["skillOrder"][number],
    ) => {
        const skillOrder = skillOrderData[0] as SkillOrder;
        const games = skillOrderData[1];
        const wins = skillOrderData[2];

        return [skillOrder, { wins, games }] as const;
    };

    for (const skillOrderData of championData.skills.skillOrder) {
        const [skillOrder, stats] = parseSkillOrder(skillOrderData);
        skills.order[skillOrder] = stats;
    }

    const parseSkillLevel = (
        skillLevelData: BuildSourceData["skills"]["skillEarly"][number],
    ) => {
        return skillLevelData.map(parseSkillLevelItem);
    };

    const parseSkillLevelItem = (
        skillLevelItemData: BuildSourceData["skills"]["skillEarly"][number][number],
        i: number,
    ) => {
        const skill = ["Q", "W", "E", "R"][i] as Skill;
        const games = skillLevelItemData[0];
        const wins = skillLevelItemData[1];

        return [skill, { wins, games }] as const;
    };

    skills.level = Array.from({
        length: championData.skills.skillEarly.length,
    }).map(() => ({}) as Record<Skill, EntityStats>);
    for (let i = 0; i < championData.skills.skillEarly.length; i++) {
        const skillLevelData = championData.skills.skillEarly[i];
        const skillStatsForLevel = parseSkillLevel(skillLevelData);
        for (const [skill, stats] of skillStatsForLevel) {
            skills.level[i][skill] = stats;
        }
    }

    return skills;
}

export function partialDatasetFromLolalyticsData(
    dataset: Dataset,
    championKey: string,
    role: Role,
    championData: BuildSourceData,
) {
    const partialDataset: PartialBuildDataset = {
        championKey,
        role,
        wins: Math.round(
            (championData.header.n * championData.header.wr) / 100,
        ),
        games: championData.header.n,
        runes: getRunesBuildData(dataset, championData),
        items: getItemsBuildData(championData),
        summonerSpells: getSummonerSpellsBuildData(championData),
        skills: getSkillsBuildData(championData),
    };

    return partialDataset;
}

export function fullDatasetFromLolalyticsData(
    dataset: Dataset,
    championKey: string,
    role: Role,
    championData: BuildSourceData,
    matchupData: {
        championKey: string;
        role: Role;
        championData: BuildSourceData;
    }[],
) {
    const partialDataset = partialDatasetFromLolalyticsData(
        dataset,
        championKey,
        role,
        championData,
    );

    const fullDataset: FullBuildDataset = {
        ...partialDataset,
        matchups: matchupData.map((matchup) => ({
            championKey: matchup.championKey,
            role: matchup.role,
            wins: Math.round(
                (matchup.championData.header.n *
                    matchup.championData.header.wr) /
                    100,
            ),
            games: matchup.championData.header.n,
            runes: getRunesBuildData(dataset, matchup.championData),
            items: getItemsBuildData(matchup.championData),
            summonerSpells: getSummonerSpellsBuildData(matchup.championData),
            skills: getSkillsBuildData(matchup.championData),
        })),
    };

    return fullDataset;
}

// Where the statistics come from. With a `fetchPage` (desktop app) they are
// read from the public Lolalytics build page, keyed by ddragon champion id.
// Without one, the legacy ax.lolalytics.com endpoint code runs as before; the
// Builds view always passes one, so that path is currently unused.
function getLolalyticsChampionOptions(
    patch: string,
    championKey: string,
    role: LolalyticsRole | "default" = "default",
    matchup?: string,
    matchupRole?: LolalyticsRole,
    page?: { fetchPage: PageFetcher; championId: string; matchupId?: string },
) {
    return {
        queryKey: [
            "lolalytics",
            page ? "page" : "champion",
            patch,
            championKey,
            role,
            matchup,
            matchupRole,
        ],
        queryFn: (): Promise<BuildSourceData> =>
            page
                ? getLolalyticsPageBuildSource(
                      page.fetchPage,
                      patch,
                      page.championId,
                      role === "default" ? "middle" : role,
                      page.matchupId,
                      matchupRole,
                  )
                : getLolalyticsChampion(
                      patch,
                      championKey,
                      role,
                      matchup,
                      matchupRole,
                  ),
        staleTime: 1000 * 60 * 60, // 1 hour
    } satisfies FetchQueryOptions;
}

export async function fetchBuildData(
    queryClient: QueryClient,
    dataset: Dataset,
    championKey: string,
    role: Role,
    opponentTeamComp: Map<Role, string>,
    fetchPage?: PageFetcher,
) {
    const pageOf = (key: string) =>
        fetchPage
            ? { fetchPage, championId: dataset.championData[key]?.id ?? key }
            : undefined;
    // convert patch from 13.7.1 to 13.7
    const patch = dataset.version.split(".").slice(0, 2).join(".");

    const championPatchDataPromises = queryClient.fetchQuery(
        getLolalyticsChampionOptions(
            patch,
            championKey,
            LOLALYTICS_ROLES[role],
            undefined,
            undefined,
            pageOf(championKey),
        ),
    );

    const champion30DaysDataPromises = queryClient.fetchQuery(
        getLolalyticsChampionOptions(
            "30",
            championKey,
            LOLALYTICS_ROLES[role],
            undefined,
            undefined,
            pageOf(championKey),
        ),
    );

    const matchup30DaysDataPromises = [...opponentTeamComp.entries()].map(
        ([opponentRole, opponentChampionKey]) =>
            queryClient
                .fetchQuery(
                    getLolalyticsChampionOptions(
                        "30",
                        championKey,
                        LOLALYTICS_ROLES[role],
                        opponentChampionKey,
                        LOLALYTICS_ROLES[opponentRole],
                        fetchPage
                            ? {
                                  ...pageOf(championKey)!,
                                  matchupId:
                                      dataset.championData[opponentChampionKey]
                                          ?.id ?? opponentChampionKey,
                              }
                            : undefined,
                    ),
                )
                .then((championData) => ({
                    championKey: opponentChampionKey,
                    role: opponentRole,
                    championData,
                }))
                // A matchup page that is missing or unreadable only drops
                // that matchup; the champion's own build stays. (The legacy
                // endpoint failed the whole build, so keep that for it.)
                .catch((e) => {
                    if (!fetchPage) throw e;
                    console.warn(
                        "Matchup build data unavailable",
                        opponentChampionKey,
                        e,
                    );
                    return null;
                }),
    );

    const results = await Promise.all([
        championPatchDataPromises,
        champion30DaysDataPromises,
        ...matchup30DaysDataPromises,
    ]);
    const [championPatchData, champion30DaysData, ...matchup30DaysData] =
        results;

    const partialDataset = partialDatasetFromLolalyticsData(
        dataset,
        championKey,
        role,
        championPatchData,
    );

    const fullDataset = fullDatasetFromLolalyticsData(
        dataset,
        championKey,
        role,
        champion30DaysData,
        matchup30DaysData.filter((m) => m !== null),
    );

    return [partialDataset, fullDataset] as const;
}
