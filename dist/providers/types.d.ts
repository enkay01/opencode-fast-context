export interface ScoreCandidate {
    id: string;
    path: string;
    code: string;
}
export interface ScoreResult {
    /** Decision score per candidate id, 0..1. Missing ids were not scored. */
    scores: Record<string, number>;
    usage: {
        input: number;
        output: number;
    } | null;
    model: string;
    /** Candidates that could not be scored before the deadline. */
    skipped: number;
}
export interface ScoreOptions {
    signal?: AbortSignal;
    deadline: number;
    concurrency: number;
}
export interface ChooseOption {
    id: string;
    label: string;
}
export interface ChooseResult {
    choice: string | null;
    probabilities: Record<string, number>;
    usage: {
        input: number;
        output: number;
    } | null;
    model: string;
}
export interface DecisionProvider {
    id: "jev" | "clef";
    model: string;
    /** Optional cap on how many candidates this provider can rank inside the deadline. */
    maxCandidates?: number;
    score(query: string, candidates: ScoreCandidate[], options: ScoreOptions): Promise<ScoreResult>;
    /** Optional single-choice judgment over a bounded list of labels. */
    choose?(query: string, options: ChooseOption[], opts: {
        deadline: number;
        signal?: AbortSignal;
    }): Promise<ChooseResult>;
}
export declare class ProviderError extends Error {
    readonly providerId: string;
    readonly status: number | null;
    constructor(providerId: string, message: string, status?: number | null);
}
export declare const RELEVANCE_INSTRUCTIONS: string;
export declare const RELEVANCE_CRITERIA: {
    true: string;
    false: string;
};
/** Previous prompt, kept only for the locator-contract comparison. */
export declare const RELEVANCE_INSTRUCTIONS_LEGACY: string;
export declare const RELEVANCE_CRITERIA_LEGACY: {
    true: string;
    false: string;
};
export declare function buildState(query: string, candidate: ScoreCandidate): Record<string, unknown>;
export declare function truncate(text: string, maxChars: number): string;
export declare function mapWithConcurrency<T, R>(items: T[], concurrency: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]>;
