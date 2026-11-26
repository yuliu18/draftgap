import { Component } from "solid-js";
import { Panel, PanelHeader } from "../../common/Panel";
import { useI18n } from "../../../contexts/I18nContext";

export const ItemSetStats: Component = () => {
    const { t } = useI18n();

    return (
        <Panel>
            <PanelHeader>{t("build.builds")}</PanelHeader>
        </Panel>
    );
};
