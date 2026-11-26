import { useI18n } from "../../contexts/I18nContext";
import { Component, Show } from "solid-js";
import { formatRating, getRatingClass } from "../../utils/rating";
import { Icon } from "solid-heroicons";
import { exclamationTriangle } from "solid-heroicons/solid-mini";
import { tooltip } from "../../directives/tooltip";
// eslint-disable-next-line
tooltip;

type Props = {
    rating: number;
    games?: number;
};

export const RatingText: Component<Props> = (props) => {
    const { t } = useI18n();
    return (
        <span
            class={`relative ${getRatingClass(props.rating)}`}
            style={{
                "font-variant-numeric": "tabular-nums",
            }}
        >
            {formatRating(props.rating)}
            <Show when={props.games !== undefined && props.games < 1000}>
                <div
                    class="absolute -top-1 -right-6"
                    // @ts-ignore
                    use:tooltip={{
                        content: t("rating.smallSample", {
                            games: Math.ceil(props.games!),
                        }),
                    }}
                >
                    <Icon
                        path={exclamationTriangle}
                        class="text-yellow-500 w-5 h-5"
                    />
                </div>
            </Show>
        </span>
    );
};
