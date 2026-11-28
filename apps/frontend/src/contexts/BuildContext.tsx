import { useQueryClient, createQuery } from "@tanstack/solid-query";
import {
    JSXElement,
    createContext,
    createEffect,
    createMemo,
    createResource,
    createSignal,
    batch,
    useContext,
} from "solid-js";
import { analyzeBuild } from "@draftgap/core/src/builds/analysis";
import { recommendBuild } from "@draftgap/core/src/builds/recommended-build";
import { fetchBuildData } from "@draftgap/core/src/builds/data";
import { defaultBuildPickIndex } from "@draftgap/core/src/builds/default-build-pick";
import {
    enemyDamageFocus,
    ItemDefenseTags,
    mapItemDefenseTags,
    situationalItems,
} from "@draftgap/core/src/builds/situational-items";
import { getTeamDamageDistribution } from "@draftgap/core/src/damage-distribution/damage-distribution";
import {
    PartialBuildDataset,
    FullBuildDataset,
} from "@draftgap/core/src/models/build/BuildDataset";
import { getPickedChampionKey, useDraft } from "./DraftContext";
import { Team } from "@draftgap/core/src/models/Team";
import { BuildEntity } from "@draftgap/core/src/models/build/BuildEntity";
import { useDraftAnalysis } from "./DraftAnalysisContext";
import { useDataset } from "./DatasetContext";
import { useDraftView } from "./DraftViewContext";
import { fetchLolalyticsPage } from "../api/lolalytics-api";

const defenseTagsCache = new Map<string, Promise<ItemDefenseTags>>();

function loadDefenseTags(version: string) {
    const cached = defenseTagsCache.get(version);
    if (cached) return cached;
    const request = fetch(
        `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/item.json`,
    )
        .then(async (response) =>
            response.ok ? mapItemDefenseTags(await response.json()) : {},
        )
        .catch(() => ({}));
    defenseTagsCache.set(version, request);
    return request;
}

export function createBuildContext() {
    const { allyTeam, opponentTeam, ownAllyIndex, selection } = useDraft();
    const { dataset, dataset30Days } = useDataset();
    const { allyTeamComp, opponentTeamComp, draftAnalysisConfig } =
        useDraftAnalysis();
    const { currentDraftView } = useDraftView();

    const [buildPick, _setBuildPick] = createSignal<{
        team: Team;
        index: number;
    }>();

    const [manualBuildPick, setManualBuildPick] = createSignal(false);

    function setBuildPick(pick: { team: Team; index: number } | undefined) {
        const teamPicks = pick?.team === "ally" ? allyTeam : opponentTeam;
        const teamComp =
            pick?.team === "ally" ? allyTeamComp() : opponentTeamComp();
        gtag("event", "set_build_pick", {
            event_category: "build",
            team: pick?.team,
            index: pick?.index,
            champion_key: pick ? teamPicks[pick!.index].championKey : undefined,
            champion_name: pick
                ? dataset()!.championData[teamPicks[pick!.index].championKey!]
                      .name
                : undefined,
            role: pick
                ? [...teamComp!.entries()].find(
                      ([, key]) => key === teamPicks[pick!.index].championKey,
                  )?.[0]
                : undefined,
        });

        batch(() => {
            setManualBuildPick(pick !== undefined);
            _setBuildPick(pick);
        });
    }

    createEffect(() => {
        const current = buildPick();
        if (current) {
            const team = current.team === "ally" ? allyTeam : opponentTeam;
            if (!getPickedChampionKey(team[current.index])) {
                batch(() => {
                    setManualBuildPick(false);
                    _setBuildPick(undefined);
                });
            } else if (manualBuildPick()) {
                return;
            }
        }

        if (currentDraftView().type !== "builds") return;
        const selectedIndex =
            selection.type === "pick" && selection.team === "ally"
                ? selection.index
                : undefined;
        const index = defaultBuildPickIndex(
            allyTeam.map((pick) => getPickedChampionKey(pick) !== undefined),
            ownAllyIndex(),
            selectedIndex,
        );
        if (index >= 0 && buildPick()?.index !== index) {
            _setBuildPick({ team: "ally", index });
        }
    });

    const [selectedEntity, _setSelectedEntity] = createSignal<
        BuildEntity | undefined
    >();
    const [showSelectedEntity, setShowSelectedEntity] = createSignal(false);
    const setSelectedEntity = (entity: BuildEntity | undefined) => {
        if (!entity) {
            setShowSelectedEntity(false);
            return;
        }

        _setSelectedEntity(entity);
        setShowSelectedEntity(true);
    };

    const team = () => (buildPick()?.team === "ally" ? allyTeam : opponentTeam);
    const championKey = () =>
        buildPick()
            ? getPickedChampionKey(team()[buildPick()!.index])
            : undefined;
    const myTeamComp = () => {
        if (!buildPick()) return undefined;
        return buildPick()!.team === "ally"
            ? allyTeamComp()
            : opponentTeamComp();
    };
    const theirTeamComp = () => {
        if (!buildPick()) return undefined;
        return buildPick()!.team === "ally"
            ? opponentTeamComp()
            : allyTeamComp();
    };
    const championRole = () => {
        if (!buildPick() || !myTeamComp()) return undefined;
        return [...myTeamComp()!.entries()].find(
            ([, key]) => key === championKey(),
        )?.[0];
    };

    const queryClient = useQueryClient();
    const query = createQuery(() => ({
        queryKey: [
            "build",
            championKey(),
            championRole(),
            theirTeamComp() ? Object.fromEntries(theirTeamComp()!) : undefined,
            dataset(),
        ],
        queryFn: async (ctx) => {
            if (championKey() === undefined || !theirTeamComp() || !dataset()) {
                return null;
            }

            const cached = queryClient.getQueryCache().find({
                queryKey: ctx.queryKey,
            });
            if (cached?.state?.data && cached.state.error == null) {
                return cached.state.data as [
                    PartialBuildDataset,
                    FullBuildDataset,
                ];
            }

            return await fetchBuildData(
                queryClient,
                dataset()!,
                championKey()!,
                championRole()!,
                theirTeamComp()!,
                // Build data is read from the Lolalytics build page; leaving
                // this argument out selects the legacy ax.lolalytics.com path.
                fetchLolalyticsPage,
            );
        },
        refetchInterval: false,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        retry: 1,
        get enabled() {
            return buildPick() != null && currentDraftView().type === "builds";
        },
    }));
    createEffect(() => {
        if (query.isError) {
            console.error("Error while fetching build data", query.error);
        }
    });

    const partialBuildDataset = () => query.data?.[0];
    const fullBuildDataset = () => query.data?.[1];

    (window as any).DRAFTGAP_DEBUG.fullBuildDataset = fullBuildDataset;

    (window as any).DRAFTGAP_DEBUG.partialBuildDataset = partialBuildDataset;

    const buildAnalysisResult = createMemo(() => {
        if (!query.data || !dataset() || !dataset30Days()) {
            return;
        }
        return analyzeBuild(
            dataset()!,
            dataset30Days()!,
            ...query.data,
            draftAnalysisConfig(),
        );
    });

    const recommendedBuild = createMemo(() =>
        recommendBuild(dataset(), partialBuildDataset(), buildAnalysisResult()),
    );

    const [defenseTags] = createResource(
        () => dataset()?.version,
        loadDefenseTags,
    );
    const situational = createMemo(() => {
        const data = dataset();
        const enemy = theirTeamComp();
        const damage =
            data && enemy
                ? getTeamDamageDistribution(
                      data,
                      new Map(
                          [...enemy].filter(
                              ([role, key]) =>
                                  data.championData[key]?.statsByRole[role]
                                      ?.damageProfile !== undefined,
                          ),
                      ),
                  )
                : undefined;
        const partial = partialBuildDataset();
        const recommendation = recommendedBuild();
        return {
            ...enemyDamageFocus(damage),
            ...situationalItems(
                partial?.items.statsByOrder,
                partial?.games ?? 0,
                defenseTags.state === "ready" ? defenseTags() : {},
                {
                    exclude: recommendation?.available
                        ? recommendation.build.coreItems.map(
                              (slot) => slot.choice.value,
                          )
                        : [],
                    boots: Object.keys(partial?.items.boots ?? {}).map(Number),
                },
            ),
        };
    });

    return {
        query,
        championKey,
        championRole,
        partialBuildDataset,
        fullBuildDataset,
        buildAnalysisResult,
        recommendedBuild,
        situational,
        buildPick,
        setBuildPick,
        selectedEntity,
        showSelectedEntity,
        setSelectedEntity,
    };
}

const BuildContext = createContext<ReturnType<typeof createBuildContext>>();

export function BuildProvider(props: { children: JSXElement }) {
    const ctx = createBuildContext();

    return (
        <BuildContext.Provider value={ctx}>
            {props.children}
        </BuildContext.Provider>
    );
}

export const useBuild = () => {
    const useCtx = useContext(BuildContext);
    if (!useCtx) throw new Error("No BuildContext found");

    return useCtx;
};
