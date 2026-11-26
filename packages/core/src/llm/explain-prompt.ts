export type ExplainPick = { championName: string; role: string };

export type ExplainOption = {
    championName: string;
    role: string;
    /** 0..1 */
    winrate: number;
    championRating: number;
    duoRating: number;
    matchupRating: number;
    personalMastery?: number;
    personalFamiliarity?: number;
    personalGames?: number;
    personalWins?: number;
};

export type ExplainRecord = { games: number; wins: number };

export type ExplainInput = {
    allyPicks: ExplainPick[];
    enemyPicks: ExplainPick[];
    pickingRole?: string;
    options: ExplainOption[];
    personal?: { overall: ExplainRecord; recent: ExplainRecord };
    responseLanguage: string;
    maxOptions?: number;
};

export type ExplainMessage = { role: "system" | "user"; content: string };

const DEFAULT_MAX_OPTIONS = 5;

const selectedOptions = (input: ExplainInput) =>
    input.options.slice(
        0,
        Math.max(0, input.maxOptions ?? DEFAULT_MAX_OPTIONS),
    );

export function canExplain(input: ExplainInput) {
    return selectedOptions(input).length > 0;
}

const int = (value: number) => {
    const rounded = Math.round(value);
    return Object.is(rounded, -0) ? 0 : rounded;
};

const pct = (winrate: number) => `${(winrate * 100).toFixed(1)}%`;

const picks = (list: ExplainPick[]) =>
    list.length === 0
        ? "none yet"
        : list.map((p) => `${p.championName} (${p.role})`).join(", ");

const record = (r: ExplainRecord) => `${r.wins} wins in ${r.games} games`;

function describeOption(option: ExplainOption, index: number) {
    const parts = [
        `winrate ${pct(option.winrate)}`,
        `champion ${int(option.championRating)}`,
        `duos ${int(option.duoRating)}`,
        `matchups ${int(option.matchupRating)}`,
    ];
    if (option.personalMastery !== undefined) {
        parts.push(`mastery ${int(option.personalMastery)}`);
    }
    if (option.personalFamiliarity !== undefined) {
        parts.push(`familiarity ${int(option.personalFamiliarity)}`);
    }
    if (option.personalGames !== undefined) {
        parts.push(
            `player history on this pick: ${record({
                games: option.personalGames,
                wins: option.personalWins ?? 0,
            })}`,
        );
    }
    return `${index + 1}. ${option.championName} (${option.role}): ${parts.join(", ")}`;
}

export function buildExplainMessages(input: ExplainInput): ExplainMessage[] {
    const system = [
        "You are a League of Legends draft assistant. A draft analysis tool already computed every number; you only explain them.",
        "Use only the numbers supplied by the user. Do not invent statistics, patch facts or numbers.",
        "Compare the supplied options against each other, citing the numbers that make them differ.",
        "When at least two options are supplied, present at least two alternatives and the trade-off between them.",
        "Never tell the player to pick one specific champion; the player decides.",
        "Ratings are in rating points (positive helps the draft, negative hurts); winrates are percentages.",
        `Answer in ${input.responseLanguage} in at most 150 words.`,
    ].join("\n");

    const options = selectedOptions(input);
    if (options.length === 0) {
        return [
            { role: "system", content: system },
            { role: "user", content: "No options were supplied." },
        ];
    }

    const lines = [
        `Allies: ${picks(input.allyPicks)}`,
        `Enemies: ${picks(input.enemyPicks)}`,
    ];
    if (input.pickingRole !== undefined) {
        lines.push(`Role being picked: ${input.pickingRole}`);
    }
    lines.push("", "Options in the order the analysis ranks them:");
    options.forEach((option, index) =>
        lines.push(describeOption(option, index)),
    );
    lines.push("");
    if (input.personal) {
        lines.push(
            `Player history. Overall: ${record(input.personal.overall)}`,
            `Recent: ${record(input.personal.recent)}`,
        );
    } else {
        lines.push("The player has no personal data stored.");
    }
    lines.push("", "Compare these options for the player.");

    return [
        { role: "system", content: system },
        { role: "user", content: lines.join("\n") },
    ];
}

export function extractExplanation(response: unknown): string {
    if (typeof response !== "object" || response === null) {
        throw new Error(
            "Unexpected response from the language model endpoint.",
        );
    }
    const body = response as Record<string, unknown>;

    if (body.error !== undefined && body.error !== null) {
        const error = body.error as { message?: unknown };
        const message =
            typeof error === "object" && typeof error.message === "string"
                ? error.message
                : typeof body.error === "string"
                  ? body.error
                  : "no message";
        throw new Error(
            `The language model endpoint returned an error: ${message}`,
        );
    }

    const first = Array.isArray(body.choices) ? body.choices[0] : undefined;
    if (first === undefined) {
        throw new Error("The response has no choices.");
    }
    const content = (first as { message?: { content?: unknown } })?.message
        ?.content;
    if (typeof content !== "string") {
        throw new Error("The response has no message content.");
    }
    const trimmed = content.trim();
    if (trimmed === "") {
        throw new Error("The response content is empty.");
    }
    return trimmed;
}
