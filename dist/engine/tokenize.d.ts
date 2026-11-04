export declare const FRAMING_VERBS: Set<string>;
export interface QueryConcept {
    /** Canonical stem or root identifier for this concept. */
    id: string;
    /** Surface and morphological forms that satisfy this concept. */
    forms: string[];
    /** Whether this concept is a primary domain term, a framing verb, or an implied fallback concept. */
    role: "domain" | "framing" | "implied";
}
/**
 * Original v0 tokenizer kept for reproducible ablation comparisons.
 */
export declare function tokenizeV0(query: string): string[];
/**
 * Deterministic morphological stemmer for code identifiers and query nouns.
 */
export declare function stemToken(token: string): string;
/**
 * Turn a developer question into searchable terms. Keeps identifiers, quoted
 * phrases, hyphenated flags, and morphological stems; drops prose filler.
 */
export declare function tokenize(query: string): string[];
/**
 * Group query terms into canonical semantic concepts so morphological variants
 * (e.g. "tools" and "tool", or "configuration" and "config") count as one
 * concept rather than double-counting.
 */
export declare function extractConcepts(query: string, repoName?: string): QueryConcept[];
export declare function splitIdentifier(identifier: string): string[];
/**
 * Pull identifiers that appear in selected code, so a second search wave can
 * follow a name into the files that define or use it.
 */
export declare function identifiersIn(code: string, limit?: number): string[];
