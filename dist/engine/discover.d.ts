import { type ExecFn } from "./files.ts";
import type { EvidenceRange, Limits } from "../types.ts";
export interface Candidate {
    id: string;
    path: string;
    ranges: EvidenceRange[];
    excerpt: string;
    matchLines: number[];
    lexicalScore: number;
}
export interface DiscoveryResult {
    candidates: Candidate[];
    matchedFiles: number;
    fileCount: number;
    waves: number;
    timedOut: boolean;
}
export declare function discover(root: string, query: string, limits: Limits, options?: {
    deadline?: number;
    signal?: AbortSignal;
    execImpl?: ExecFn;
}): Promise<DiscoveryResult>;
export declare function pathHitScore(tokens: string[], path: string): number;
export declare function lexicalScore(tokens: string[], weights: Map<string, number>, path: string, excerpt: string, range: EvidenceRange): number;
export declare function readCandidateExcerpt(root: string, candidate: Candidate, maxBytes: number): Promise<{
    text: string;
    digest: string;
    ranges: EvidenceRange[];
    sections: {
        range: EvidenceRange;
        text: string;
    }[];
} | null>;
