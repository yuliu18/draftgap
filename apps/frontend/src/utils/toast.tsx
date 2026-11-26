import {
    arrowDownTray,
    check,
    exclamationCircle,
    star,
} from "solid-heroicons/outline";
import toast from "solid-toast";
import { Toast } from "../components/common/Toast";
import { MessageKey, MessageParams } from "@draftgap/core/src/i18n/messages";

type Translate = (key: MessageKey, params?: MessageParams) => string;

export const createImportFavouritePicksToast = (
    tr: Translate,
    onSubmit: () => void,
) => {
    return toast.custom((t) => (
        <Toast
            t={t}
            closeLabel={tr("common.close")}
            icon={star}
            title={tr("toast.importFavs.title")}
            content={tr("toast.importFavs.body")}
            dismissText={tr("toast.notNow")}
            okText={tr("toast.import")}
            onSubmit={onSubmit}
        />
    ));
};

export const createImportFavouritePicksSuccessToast = (
    tr: Translate,
    amount: number,
) => {
    return toast.custom(
        (t) => (
            <Toast
                t={t}
                closeLabel={tr("common.close")}
                icon={check}
                title={tr("toast.success")}
                content={tr("toast.importFavs.done", { count: amount })}
            />
        ),
        {
            duration: 3000,
        },
    );
};

export const createErrorToast = (tr: Translate, message: string) => {
    return toast.custom(
        (t) => (
            <Toast
                t={t}
                closeLabel={tr("common.close")}
                icon={exclamationCircle}
                title={tr("toast.error")}
                content={message}
            />
        ),
        {
            duration: 3000,
        },
    );
};

export const createMustSelectToast = (tr: Translate) => {
    return toast.custom(
        (t) => (
            <Toast
                t={t}
                closeLabel={tr("common.close")}
                icon={exclamationCircle}
                title={tr("toast.mustSelect.title")}
                content={tr("toast.mustSelect.body")}
            />
        ),
        {
            duration: 3000,
        },
    );
};

export const createUpdateAvailableToast = (
    tr: Translate,
    onSubmit: () => void,
) => {
    return toast.custom((t) => (
        <Toast
            t={t}
            closeLabel={tr("common.close")}
            icon={arrowDownTray}
            title={tr("toast.update.title")}
            content={tr("toast.update.body")}
            dismissText={tr("toast.later")}
            okText={tr("toast.update")}
            onSubmit={onSubmit}
        />
    ));
};
