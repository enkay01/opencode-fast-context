import { type DecisionProvider } from "./types.ts";
export declare const GEMINI_DECISION_MODEL = "gemini-decision-1";
export interface GeminiConfig {
    apiKey: string;
    /** A Gemini-specific threshold. Omit until a variant has been calibrated. */
    minDecision?: number;
    /** Benchmark-only variant; production uses independent per-candidate calls. */
    layout?: "per-candidate" | "multi-question";
    /** Private transport seams for deterministic tests. */
    fetchImpl?: typeof fetch;
    endpoint?: string;
}
export declare function createGeminiProvider(config: GeminiConfig): DecisionProvider;
