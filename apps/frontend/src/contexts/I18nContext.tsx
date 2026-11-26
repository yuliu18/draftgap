import {
    JSXElement,
    createContext,
    createEffect,
    createResource,
    useContext,
} from "solid-js";
import {
    LocalizedGameNames,
    ddragonNamesUrls,
    mapChampionNames,
    mapItemNames,
    mapRuneNames,
    mapSummonerSpellNames,
} from "@draftgap/core/src/i18n/ddragon-names";
import {
    MessageKey,
    MessageParams,
    SPANISH_LANGUAGE,
    translate,
    uiLocale,
} from "@draftgap/core/src/i18n/messages";
import { es as dateFnsEs } from "date-fns/locale/es";
import { Role } from "@draftgap/core/src/models/Role";
import { Team } from "@draftgap/core/src/models/Team";
import { useUser } from "./UserContext";
import { useDataset } from "./DatasetContext";
import { setGameNames } from "../utils/i18n";

async function fetchJson(url: string) {
    try {
        const response = await fetch(url);
        if (!response.ok) return undefined;
        return (await response.json()) as unknown;
    } catch (err) {
        console.error(err);
        return undefined;
    }
}

// Cached in memory for the session, one request set per version and locale.
const namesCache = new Map<string, Promise<LocalizedGameNames>>();

function loadGameNames(version: string, locale: string) {
    const cacheKey = `${version}:${locale}`;
    const cached = namesCache.get(cacheKey);
    if (cached) return cached;

    const urls = ddragonNamesUrls(version, locale);
    const promise = Promise.all([
        fetchJson(urls.champions),
        fetchJson(urls.items),
        fetchJson(urls.runes),
        fetchJson(urls.summonerSpells),
    ]).then(([champions, items, runes, summonerSpells]) => {
        const runeNames = mapRuneNames(runes);
        const names: LocalizedGameNames = {
            champions: mapChampionNames(champions),
            items: mapItemNames(items),
            runes: runeNames.runes,
            runePaths: runeNames.paths,
            summonerSpells: mapSummonerSpellNames(summonerSpells),
        };
        const failed = Object.values(names).every(
            (map) => Object.keys(map).length === 0,
        );
        // Do not cache a total failure, so a later language switch retries.
        if (failed) namesCache.delete(cacheKey);
        return names;
    });
    namesCache.set(cacheKey, promise);
    return promise;
}

function createI18nContext() {
    const { config } = useUser();
    const { dataset } = useDataset();

    const t = (key: MessageKey, params?: MessageParams) =>
        translate(config.language, key, params);

    const dateLocale = () =>
        uiLocale(config.language) === "es" ? dateFnsEs : undefined;

    const [names] = createResource(
        () => {
            const version = dataset()?.version;
            return config.language === SPANISH_LANGUAGE && version
                ? { version, locale: config.language }
                : undefined;
        },
        ({ version, locale }) => loadGameNames(version, locale),
    );

    createEffect(() => {
        setGameNames(
            config.language === SPANISH_LANGUAGE ? names() : undefined,
        );
    });

    const roleName = (role: Role) => t(`role.${role}`);
    const teamName = (team: Team) => t(`team.${team}`);

    const localeTag = () =>
        uiLocale(config.language) === "es" ? "es-ES" : undefined;

    return { t, dateLocale, localeTag, roleName, teamName };
}

const I18nContext = createContext<ReturnType<typeof createI18nContext>>();

export function I18nProvider(props: { children: JSXElement }) {
    return (
        <I18nContext.Provider value={createI18nContext()}>
            {props.children}
        </I18nContext.Provider>
    );
}

export function useI18n() {
    const useCtx = useContext(I18nContext);
    if (!useCtx) throw new Error("No I18nContext found");

    return useCtx;
}
