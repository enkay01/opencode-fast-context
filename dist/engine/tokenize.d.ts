/**
 * Turn a developer question into searchable terms. Keeps identifiers, quoted
 * phrases and path fragments; drops prose filler.
 */
export declare function tokenize(query: string): string[];
export declare function splitIdentifier(identifier: string): string[];
/**
 * Pull identifiers that appear in selected code, so a second search wave can
 * follow a name into the files that define or use it.
 */
export declare function identifiersIn(code: string, limit?: number): string[];
