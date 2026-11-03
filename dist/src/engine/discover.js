import { join } from "node:path";
import { exec, isExcluded } from "./files.js";
import { identifiersIn, tokenize } from "./tokenize.js";
const DEFINITION = /\b(function|class|interface|type|const|let|var|def|fn|struct|enum|impl|export)\b/i;
const CONTEXT_LINES = 4;
export async function discover(root, query, limits, options) {
    const remaining = () => Math.max(1, options.deadline - Date.now());
    const started = Date.now();
    const repoName = String(root).split("/").filter(Boolean).at(-1)?.toLowerCase() ?? "";
    const tokens = tokenize(query)
        .filter((token) => token !== repoName)
        .slice(0, 10);
    if (tokens.length === 0) {
        return { candidates: [], matchedFiles: 0, fileCount: 0, waves: 0, timedOut: false };
    }
    const matches = new Map();
    const fileSets = new Map();
    let waves = 0;
    let timedOut = false;
    const listFilesFor = async (term) => {
        const result = await exec("rg", ["-l", "--no-messages", "-i", "-e", wordPattern(term)], {
            cwd: root,
            timeoutMs: Math.min(remaining(), 5000),
            ...(options.signal ? { signal: options.signal } : {}),
        });
        if (result.timedOut)
            timedOut = true;
        return new Set(result.stdout
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
            .filter((file) => !isExcluded(file)));
    };
    const collect = async (terms, weightOverride) => {
        waves += 1;
        const sets = await Promise.all(terms.map((term) => listFilesFor(term)));
        for (let index = 0; index < terms.length; index += 1) {
            fileSets.set(terms[index], sets[index]);
        }
        const union = new Set();
        for (const set of sets)
            for (const file of set)
                union.add(file);
        if (union.size === 0)
            return;
        const weights = weightsFor(tokens, fileSets, union.size);
        if (weightOverride !== null)
            for (const term of terms)
                weights.set(term, weightOverride);
        const shortlist = [...union]
            .map((path) => {
            let tokenHits = 0;
            for (const token of tokens) {
                if (fileSets.get(token)?.has(path))
                    tokenHits += 1;
            }
            return {
                path,
                score: weightedPathScore(tokens, weights, path) + tokenHits * 1.2 + specificity(path),
            };
        })
            .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
            .slice(0, 500)
            .map((item) => item.path);
        if (shortlist.length === 0)
            return;
        const lineResult = await exec("rg", [
            "-n",
            "--no-heading",
            "--no-messages",
            "-i",
            ...terms.flatMap((term) => ["-e", wordPattern(term)]),
            "--",
            ...shortlist,
        ], {
            cwd: root,
            timeoutMs: Math.min(remaining(), 5000),
            maxBytes: 4_000_000,
            ...(options.signal ? { signal: options.signal } : {}),
        });
        if (lineResult.timedOut)
            timedOut = true;
        for (const raw of lineResult.stdout.split("\n")) {
            const parsed = /^(.+?):(\d+):(.*)$/.exec(raw);
            if (!parsed)
                continue;
            const path = parsed[1];
            const lineNumber = Number(parsed[2]);
            const text = (parsed[3] ?? "").trim();
            if (!path || !lineNumber)
                continue;
            const entry = matches.get(path) ?? { path, lines: new Map() };
            if (!entry.lines.has(lineNumber))
                entry.lines.set(lineNumber, text);
            matches.set(path, entry);
        }
    };
    await collect(tokens, null);
    if (timedOut || options.signal?.aborted || Date.now() >= options.deadline) {
        return { candidates: [], matchedFiles: matches.size, fileCount: matches.size, waves, timedOut: true };
    }
    let weights = weightsFor(tokens, fileSets, matches.size || 1);
    let candidates = buildCandidates(matches, tokens, weights, limits);
    for (let wave = 1; wave < limits.waves; wave += 1) {
        if (Date.now() >= options.deadline || options.signal?.aborted)
            break;
        if (Date.now() - started > limits.deadlineMs * 0.35)
            break;
        if (matches.size > 36)
            break;
        const followed = new Set();
        for (const candidate of candidates.slice(0, 8)) {
            for (const identifier of identifiersIn(candidate.excerpt, 5)) {
                if (identifier.length >= 6)
                    followed.add(identifier);
            }
        }
        const lowered = new Set(tokens.map((token) => token.toLowerCase()));
        const fresh = [...followed].filter((term) => !lowered.has(term.toLowerCase())).slice(0, 8);
        if (fresh.length === 0)
            break;
        const before = matches.size;
        await collect(fresh, 1);
        if (matches.size === before)
            break;
        weights = weightsFor(tokens, fileSets, matches.size || 1);
        candidates = buildCandidates(matches, tokens, weights, limits);
    }
    const ranked = candidates
        .sort((a, b) => b.lexicalScore - a.lexicalScore || a.path.localeCompare(b.path))
        .slice(0, limits.candidates);
    return { candidates: ranked, matchedFiles: matches.size, fileCount: matches.size, waves, timedOut };
}
function wordPattern(term) {
    return `\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`;
}
function weightsFor(tokens, fileSets, totalFiles) {
    const raw = new Map();
    let max = 0;
    for (const token of tokens) {
        const df = fileSets.get(token)?.size ?? 1;
        const weight = Math.log2((totalFiles + 1) / (df + 1)) + 0.4;
        raw.set(token, weight);
        max = Math.max(max, weight);
    }
    for (const [token, weight] of raw)
        raw.set(token, Math.max(0.15, weight / (max || 1)));
    return raw;
}
function weightedPathScore(tokens, weights, path) {
    const lowerPath = path.toLowerCase();
    const fileName = lowerPath.split("/").at(-1) ?? lowerPath;
    let score = 0;
    for (const token of tokens) {
        const weight = weights.get(token) ?? 0.5;
        if (fileName.includes(token))
            score += 3 * weight;
        else if (lowerPath.includes(token))
            score += 1.5 * weight;
    }
    return score;
}
function specificity(path) {
    if (/\.(md|mdx|txt|rst|adoc)$/i.test(path) || /(^|\/)docs?\//i.test(path))
        return -1;
    if (/\.(test|spec)\.[a-z]+$/i.test(path) || /(^|\/)(tests?|__tests__|e2e|fixtures)\//i.test(path))
        return -0.6;
    if (/\.(json|lock|yaml|yml|toml)$/i.test(path))
        return -0.4;
    return 0;
}
function buildCandidates(matches, tokens, weights, limits) {
    const candidates = [];
    for (const file of matches.values()) {
        const lines = [...file.lines.keys()].sort((a, b) => a - b);
        if (lines.length === 0)
            continue;
        const windows = groupIntoWindows(lines, limits.windowLines);
        const perFile = [];
        for (const window of windows) {
            const excerpt = lines
                .filter((line) => line >= window.start && line <= window.end)
                .map((line) => `${line}: ${file.lines.get(line) ?? ""}`)
                .join("\n");
            const lexical = lexicalScore(tokens, weights, file.path, excerpt, window);
            perFile.push({
                id: `${file.path}#${window.start}-${window.end}`,
                path: file.path,
                ranges: [window],
                excerpt,
                matchLines: lines.filter((line) => line >= window.start && line <= window.end),
                lexicalScore: lexical,
            });
        }
        perFile.sort((a, b) => b.lexicalScore - a.lexicalScore);
        candidates.push(...perFile.slice(0, 6));
    }
    return candidates;
}
function groupIntoWindows(lines, maxLines) {
    const windows = [];
    for (const line of lines) {
        const start = Math.max(1, line - CONTEXT_LINES);
        const end = line + CONTEXT_LINES;
        const last = windows.at(-1);
        const mergedEnd = last ? Math.max(last.end, end) : 0;
        if (last && start <= last.end + 1 && mergedEnd - last.start + 1 <= maxLines) {
            last.end = mergedEnd;
        }
        else if (last && start <= last.end + 1) {
            continue;
        }
        else {
            windows.push({ start, end });
        }
    }
    return windows;
}
export function pathHitScore(tokens, path) {
    const lowerPath = path.toLowerCase();
    const fileName = lowerPath.split("/").at(-1) ?? lowerPath;
    let score = 0;
    for (const token of tokens) {
        if (fileName.includes(token))
            score += 2;
        else if (lowerPath.includes(token))
            score += 1;
    }
    return score;
}
export function lexicalScore(tokens, weights, path, excerpt, range) {
    const lowerPath = path.toLowerCase();
    let pathScore = 0;
    let codeScore = 0;
    let matchedWeight = 0;
    for (const token of tokens) {
        const weight = weights.get(token) ?? 0.5;
        let matched = false;
        if (lowerPath.includes(token)) {
            matched = true;
            pathScore += weight;
        }
        let tokenScore = 0;
        for (const raw of excerpt.split("\n")) {
            const text = raw.replace(/^\d+:\s*/, "");
            if (!text.toLowerCase().includes(token))
                continue;
            matched = true;
            const trimmed = text.trim();
            const isImport = /^(import|from|use |require\(|#include|export .* from)/.test(trimmed);
            const isComment = /^(\/\/|#|\*|\/\*)/.test(trimmed);
            const isDefinition = DEFINITION.test(trimmed);
            tokenScore += isDefinition ? 1.6 : isImport ? 0.15 : isComment ? 0.35 : 1.1;
        }
        codeScore += Math.min(tokenScore, 4) * weight;
        if (matched)
            matchedWeight += weight;
    }
    let score = Math.min(pathScore, 6) * 1.4 + codeScore + matchedWeight * 0.8;
    if (/\.(md|mdx|txt|rst|adoc)$/i.test(path) || /(^|\/)docs?\//i.test(path))
        score *= 0.45;
    if (/\.(test|spec)\.[a-z]+$/i.test(path) || /(^|\/)(tests?|__tests__|e2e|fixtures)\//i.test(path))
        score *= 0.55;
    if (/\.(json|lock|yaml|yml|toml)$/i.test(path))
        score *= 0.7;
    const span = range.end - range.start + 1;
    if (span <= 8)
        score += 0.3;
    return Math.round(score * 1000) / 1000;
}
export async function readCandidateExcerpt(root, candidate, maxBytes) {
    const absolute = join(root, candidate.path);
    let buffer;
    try {
        const { readFile: read, realpath } = await import("node:fs/promises");
        const realRoot = await realpath(root);
        const realFile = await realpath(absolute);
        const rootPrefix = realRoot.endsWith("/") ? realRoot : `${realRoot}/`;
        if (!realFile.startsWith(rootPrefix))
            return null;
        buffer = await read(realFile);
    }
    catch {
        return null;
    }
    if (buffer.length > maxBytes)
        return null;
    if (buffer.subarray(0, 4096).includes(0))
        return null;
    const text = buffer.toString("utf8");
    const lines = text.split(/\r?\n/);
    const sections = candidate.ranges
        .map((range) => {
        const start = Math.max(1, Math.min(range.start, lines.length));
        const end = Math.max(1, Math.min(range.end, lines.length));
        return { range: { start, end }, text: lines.slice(start - 1, end).join("\n") };
    })
        .filter((section) => section.range.end >= section.range.start && section.text.length > 0);
    if (sections.length === 0)
        return null;
    const { createHash } = await import("node:crypto");
    const digest = createHash("sha256").update(buffer).digest("hex");
    return {
        text: sections.map((section) => section.text).join("\n…\n"),
        digest,
        ranges: sections.map((section) => section.range),
        sections,
    };
}
//# sourceMappingURL=discover.js.map