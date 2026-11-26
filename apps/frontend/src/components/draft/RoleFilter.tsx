import { ComponentProps, For } from "solid-js";
import { useDraft } from "../../contexts/DraftContext";
import { ROLES } from "@draftgap/core/src/models/Role";
import { RoleIcon } from "../icons/roles/RoleIcon";
import { useDraftAnalysis } from "../../contexts/DraftAnalysisContext";
import { useDraftFilters } from "../../contexts/DraftFiltersContext";
import { cn } from "../../utils/style";

export function RoleFilter(props: ComponentProps<"span">) {
    const { selection } = useDraft();
    const { roleFilter, setRoleFilter } = useDraftFilters();
    const { getFilledRoles, roleFilterTeam } = useDraftAnalysis();

    const filledRoles = () =>
        (roleFilterTeam() && getFilledRoles(roleFilterTeam()!)) ?? new Set();

    return (
        <span
            {...props}
            class={cn(
                "isolate inline-flex overflow-hidden rounded-md border border-pg-ln2",
                props.class,
            )}
        >
            <For each={ROLES}>
                {(role, i) => (
                    <button
                        type="button"
                        class="relative inline-flex size-7 items-center justify-center text-pg-mu hover:enabled:bg-pg-s2 hover:enabled:text-pg-tx focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-pg-ac disabled:opacity-30"
                        classList={{
                            "border-l border-pg-ln2": i() !== 0,
                            "bg-pg-s3! text-pg-tx!": roleFilter() === role,
                        }}
                        aria-pressed={roleFilter() === role}
                        onClick={() =>
                            roleFilter() === role
                                ? setRoleFilter(undefined)
                                : setRoleFilter(role)
                        }
                        disabled={filledRoles().has(role) || !selection.team}
                    >
                        <RoleIcon role={role} class="h-4" />
                    </button>
                )}
            </For>
        </span>
    );
}
