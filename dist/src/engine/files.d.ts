export interface ExecResult {
    code: number | null;
    stdout: string;
    stderr: string;
    timedOut: boolean;
}
export declare function exec(command: string, args: string[], options: {
    cwd: string;
    timeoutMs: number;
    signal?: AbortSignal;
    maxBytes?: number;
}): Promise<ExecResult>;
export declare function isExcluded(relativePath: string): boolean;
export declare function toPosix(relativePath: string): string;
export declare function listFiles(root: string, timeoutMs: number): Promise<string[]>;
export declare function displayPath(root: string, absolute: string): string;
