export interface ExecResult {
    code: number | null;
    stdout: string;
    stderr: string;
    timedOut: boolean;
}
export interface ExecOptions {
    cwd: string;
    timeoutMs: number;
    signal?: AbortSignal;
    maxBytes?: number;
}
export type ExecFn = (command: string, args: string[], options: ExecOptions) => Promise<ExecResult>;
export declare function spawnOptions(options: {
    cwd: string;
    signal?: AbortSignal;
}): {
    cwd: string;
    stdio: ["ignore", "pipe", "pipe"];
    windowsHide: true;
    signal?: AbortSignal;
};
export declare function exec(command: string, args: string[], options: ExecOptions): Promise<ExecResult>;
export declare function isExcluded(relativePath: string): boolean;
export declare function toPosix(relativePath: string): string;
export declare function listFiles(root: string, timeoutMs: number): Promise<string[]>;
export declare function displayPath(root: string, absolute: string): string;
