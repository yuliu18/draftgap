import { useI18n } from "../../contexts/I18nContext";
import { ProPanel, ProPanelHead } from "../common/Pro";

/** Placeholder of the Partida screen until the scouting arrives (T10.3). */
export function MatchPlaceholder() {
    const { t } = useI18n();

    return (
        <div class="flex min-h-0 flex-1 flex-col p-4">
            <ProPanel class="flex-1">
                <ProPanelHead title={t("nav.match")} />
                <div class="flex flex-1 items-center justify-center p-8 text-center text-pg-mu">
                    <p class="max-w-md">{t("match.soon")}</p>
                </div>
            </ProPanel>
        </div>
    );
}
