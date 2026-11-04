import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";
export async function exec(command, args, options) {
    return new Promise((resolve) => {
        const child = spawn(command, args, {
            cwd: options.cwd,
            stdio: ["ignore", "pipe", "pipe"],
            signal: options.signal,
        });
        const chunks = [];
        const errors = [];
        let size = 0;
        const maxBytes = options.maxBytes ?? 8_000_000;
        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            child.kill("SIGKILL");
        }, Math.max(1, options.timeoutMs));
        const cleanup = () => clearTimeout(timer);
        const onAbort = () => child.kill("SIGKILL");
        options.signal?.addEventListener("abort", onAbort);
        child.stdout.on("data", (chunk) => {
            if (size >= maxBytes)
                return;
            size += chunk.length;
            chunks.push(chunk);
        });
        child.stderr.on("data", (chunk) => errors.push(chunk));
        child.on("error", () => {
            cleanup();
            options.signal?.removeEventListener("abort", onAbort);
            resolve({ code: null, stdout: "", stderr: "", timedOut });
        });
        child.on("close", (code) => {
            cleanup();
            options.signal?.removeEventListener("abort", onAbort);
            resolve({
                code,
                stdout: Buffer.concat(chunks).toString("utf8"),
                stderr: Buffer.concat(errors).toString("utf8"),
                timedOut,
            });
        });
    });
}
const SECRET_PATTERNS = [
    /(^|\/)\.env(\.|$)/i,
    /(^|\/)\.npmrc$/i,
    /(^|\/)\.yarnrc(\.yml)?$/i,
    /(^|\/)\.netrc$/i,
    /(^|\/)\.pypirc$/i,
    /(^|\/)\.git-credentials$/i,
    /(^|\/)\.pgpass$/i,
    /(^|\/)\.my\.cnf$/i,
    /(^|\/)\.docker\/config\.json$/i,
    /(^|\/)\.kube\/config$/i,
    /(^|\/)\.aws\/(credentials|config)$/i,
    /(^|\/)\.config\/gcloud\//i,
    /(^|\/)\.azure\//i,
    /(^|\/)\.ssh\/id_/i,
    /(^|\/)auth\.json$/i,
    /(^|\/)(service[-_]account|gcp[-_]credentials)[^/]*\.json$/i,
    /\.(tfvars|tfstate)$/i,
    /(^|\/)id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/i,
    /\.(pem|key|p12|pfx|jks|keystore)$/i,
    /(^|\/)credentials?(\.|$)/i,
    /(^|\/)secrets?(\.|$)/i,
];
const BINARY_EXTENSIONS = new Set([
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".ico",
    ".pdf",
    ".zip",
    ".gz",
    ".tar",
    ".tgz",
    ".woff",
    ".woff2",
    ".ttf",
    ".otf",
    ".mp4",
    ".mov",
    ".mp3",
    ".wasm",
    ".node",
    ".so",
    ".dylib",
    ".dll",
    ".exe",
    ".class",
    ".jar",
    ".lockb",
]);
export function isExcluded(relativePath) {
    const normalized = relativePath.split(sep).join("/");
    if (SECRET_PATTERNS.some((pattern) => pattern.test(normalized)))
        return true;
    return BINARY_EXTENSIONS.has(extname(normalized).toLowerCase());
}
export function toPosix(relativePath) {
    return relativePath.split(sep).join("/");
}
export async function listFiles(root, timeoutMs) {
    const result = await exec("rg", ["--files", "--hidden", "--glob", "!.git", "--glob", "!node_modules"], { cwd: root, timeoutMs });
    if (result.code === 0 || (result.code === 1 && result.stdout)) {
        return result.stdout
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
            .filter((file) => !isExcluded(file))
            .map(toPosix)
            .sort();
    }
    if (result.code === 1)
        return [];
    return walk(root);
}
async function walk(root, prefix = "", depth = 0) {
    if (depth > 12)
        return [];
    const entries = await readdir(join(root, prefix), { withFileTypes: true }).catch(() => []);
    const files = [];
    for (const entry of entries) {
        if (entry.name === ".git" || entry.name === "node_modules")
            continue;
        const next = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
            files.push(...(await walk(root, next, depth + 1)));
        }
        else if (entry.isFile() && !isExcluded(next)) {
            files.push(next);
        }
    }
    return files.sort();
}
export function displayPath(root, absolute) {
    return toPosix(relative(root, absolute));
}
