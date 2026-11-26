import { RiskLevel } from "../../risk/risk-level";
import { PersonalConfig } from "../../personal/personal-rating";

export type StatsSite = "op.gg" | "u.gg" | "lolalytics";

export const DraftTablePlacement = {
    Bottom: "bottom",
    Hidden: "hidden",
    InPlace: "in-place",
} as const;
type DraftTablePlacement =
    (typeof DraftTablePlacement)[keyof typeof DraftTablePlacement];

export type LlmConfig = {
    enabled: boolean;
    baseUrl: string;
    model: string;
    // Empty means "not chosen": the answer language follows the UI language.
    responseLanguage: string;
};

export const DEFAULT_LLM_CONFIG: LlmConfig = {
    enabled: false,
    baseUrl: "",
    model: "",
    responseLanguage: "",
};

export type DraftGapConfig = {
    // DRAFT ANALYSIS
    ignoreChampionWinrates: boolean;
    riskLevel: RiskLevel;
    minGames: number;
    analyzeHovers: boolean;

    // DRAFT SUGGESTIONS
    showFavouritesAtTop: boolean;
    banPlacement: DraftTablePlacement;
    unownedPlacement: DraftTablePlacement;
    showAdvancedWinrates: boolean;
    language: string;

    // MISC
    defaultStatsSite: StatsSite;
    enableBetaFeatures: boolean;

    // LOL CLIENT
    disableLeagueClientIntegration: boolean;

    // PERSONAL
    personal: PersonalConfig;

    // LLM EXPLANATION (the API key is never part of the config)
    llm: LlmConfig;
};
