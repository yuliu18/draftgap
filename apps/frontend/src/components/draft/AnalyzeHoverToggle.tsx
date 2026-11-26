import { useDraftAnalysis } from "../../contexts/DraftAnalysisContext";
import { tooltip } from "../../directives/tooltip";
import { Icon } from "solid-heroicons";
import { eye, eyeSlash } from "solid-heroicons/solid";
import { cn } from "../../utils/style";
import { buttonVariants } from "../common/Button";
import { useI18n } from "../../contexts/I18nContext";
// eslint-disable-next-line
tooltip;

export function AnalyzeHoverToggle() {
    const { analyzeHovers, setAnalyzeHovers } = useDraftAnalysis();
    const { t } = useI18n();

    return (
        <button
            // @ts-ignore
            use:tooltip={{
                content: t("draft.analyzeHovers"),
            }}
            onClick={() => setAnalyzeHovers(!analyzeHovers())}
            class={cn(
                buttonVariants({ variant: "transparent" }),
                "px-1 text-neutral-50",
                !analyzeHovers() && "text-neutral-700",
            )}
        >
            <Icon path={analyzeHovers() ? eye : eyeSlash} class="w-6 h-6" />
        </button>
    );
}
