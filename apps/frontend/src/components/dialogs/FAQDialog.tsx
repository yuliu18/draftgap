import { DialogContent, DialogHeader, DialogTitle } from "../common/Dialog";
import { useI18n } from "../../contexts/I18nContext";

export function FAQDialog() {
    const { t } = useI18n();

    return (
        <DialogContent class="max-w-2xl">
            <DialogHeader>
                <DialogTitle>{t("faq.title")}</DialogTitle>
            </DialogHeader>
            <div>
                <h2 class="text-2xl uppercase">{t("faq.what.q")}</h2>
                <p class="font-body">{t("faq.what.a")}</p>
            </div>

            <div>
                <h2 class="text-2xl uppercase">{t("faq.how.q")}</h2>
                <p class="font-body">
                    {t("faq.how.a1")}{" "}
                    <a
                        href="https://www.youtube.com/@Jayensee"
                        class="text-blue-500"
                        target="_blank"
                    >
                        Jayensee
                    </a>{" "}
                    {t("faq.how.a2")}{" "}
                    <a
                        href="https://www.youtube.com/watch?v=YQkWmysNBt8"
                        class="text-blue-500"
                        target="_blank"
                    >
                        {t("faq.how.video")}
                    </a>
                    .
                </p>
            </div>

            <div>
                <h2 class="text-2xl uppercase">{t("faq.short.q")}</h2>
                <p class="font-body">
                    {t("faq.short.a1")}
                    <br />
                    {t("faq.short.a2")}
                </p>
            </div>

            <div>
                <h2 class="text-2xl uppercase">{t("faq.data.q")}</h2>
                <p class="font-body">
                    {t("faq.data.a1")}{" "}
                    <a
                        href="https://lolalytics.com"
                        class="text-blue-500"
                        target="_blank"
                    >
                        Lolalytics
                    </a>{" "}
                    {t("faq.data.a2")}
                </p>
            </div>

            <div>
                <h2 class="text-2xl uppercase">{t("faq.rank.q")}</h2>
                <p class="font-body">{t("faq.rank.a")}</p>
            </div>

            <div>
                <h2 class="text-2xl uppercase" id="faq-risk-level">
                    {t("faq.risk.q")}
                </h2>
                <p class="font-body">{t("faq.risk.a")}</p>
            </div>

            <p class="font-body font-bold">
                {t("faq.contact")}{" "}
                <a
                    href="mailto:vigovlugt+draftgap@gmail.com"
                    class="text-blue-500 font-normal"
                    target="_blank"
                >
                    vigovlugt+draftgap@gmail.com
                </a>
            </p>
        </DialogContent>
    );
}
