import { type Limits, type SearchResult } from "../types.ts";
import { discover } from "./discover.ts";
import type { DecisionProvider } from "../providers/types.ts";
export interface SearchOptions {
    root: string;
    query: string;
    maxFiles?: number;
    limits?: Partial<Limits>;
    provider?: DecisionProvider | null;
    signal?: AbortSignal;
    /** Called as each pipeline stage completes; keep it out of model-facing output. */
    onStage?: (stage: string) => void;
    /** Attach the discovery pool and ranked decisions for benchmark instrumentation. */
    includeDiagnostics?: boolean;
    /** Internal test seam for timeout/status fixtures. */
    discoverImpl?: typeof discover;
}
export declare function searchRepository(options: SearchOptions): Promise<SearchResult>;
