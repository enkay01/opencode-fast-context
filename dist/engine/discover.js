import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { join } from "node:path";
import { exec, isExcluded, toPosix } from "./files.js";
import { extractConcepts, identifiersIn, splitIdentifier, stemToken, tokenize, tokenizeV0, } from "./tokenize.js";
const DEFINITION = /\b(function|class|interface|type|const|let|var|def|fn|struct|enum|impl|export|Effect\.fn)\b/i;
const CONTEXT_LINES = 4;
export async function discover(root, query, limits, options) {
    const stage = limits.ablationStage ?? "climb3";
    const remaining = () => Math.max(1, options.deadline - Date.now());
    const started = Date.now();
    const repoName = String(root).split("/").filter(Boolean).at(-1)?.toLowerCase() ?? "";
    const rawTokens = stage === "v0" ? tokenizeV0(query) : tokenize(query);
    const tokens = rawTokens
        .filter((token) => token !== repoName && !(repoName === "opencode" && token === "open"))
        .slice(0, stage === "v0" ? 10 : 16);
    if (tokens.length === 0) {
        return { candidates: [], matchedFiles: 0, fileCount: 0, waves: 0, timedOut: false };
    }
    const concepts = stage === "v0" || stage === "climb1" ? null : extractConcepts(query, repoName);
    const matches = new Map();
    const fileSets = new Map();
    let totalUnionFiles = 0;
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
            .map(toPosix)
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
        totalUnionFiles = Math.max(totalUnionFiles, union.size);
        const weights = weightsFor(tokens, fileSets, union.size);
        if (weightOverride !== null)
            for (const term of terms)
                weights.set(term, weightOverride);
        const shortlist = [...union]
            .map((path) => {
            let tokenHits = 0;
            if (concepts) {
                for (const concept of concepts) {
                    if (concept.forms.some((form) => fileSets.get(form)?.has(path))) {
                        tokenHits += concept.role === "domain" ? 1.4 : 0.7;
                    }
                }
            }
            else {
                for (const token of tokens) {
                    if (fileSets.get(token)?.has(path))
                        tokenHits += 1;
                }
            }
            return {
                path,
                score: weightedPathScore(tokens, weights, path, concepts) +
                    tokenHits * 1.2 +
                    specificity(path),
            };
        })
            .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
            .slice(0, 500)
            .map((item) => item.path);
        if (shortlist.length === 0)
            return;
        const chosen = new Set(shortlist);
        const byName = [...union]
            .filter((path) => {
            if (chosen.has(path))
                return false;
            const base = (path.split("/").at(-1) ?? "").toLowerCase().replace(/\.[^.]+$/, "");
            return tokens.some((token) => token.length >= 3 && base.includes(token));
        })
            .sort((a, b) => weightedPathScore(tokens, weights, b, concepts) -
            weightedPathScore(tokens, weights, a, concepts))
            .slice(0, 60);
        shortlist.push(...byName);
        for (let offset = 0; offset < shortlist.length; offset += 100) {
            const chunk = shortlist.slice(offset, offset + 100);
            const lineResult = await exec("rg", [
                "-n",
                "-H",
                "--no-heading",
                "--no-messages",
                "-i",
                ...terms.flatMap((term) => ["-e", wordPattern(term)]),
                "--",
                ...chunk,
            ], {
                cwd: root,
                timeoutMs: Math.min(remaining(), 5000),
                maxBytes: 8_000_000,
                ...(options.signal ? { signal: options.signal } : {}),
            });
            if (lineResult.timedOut)
                timedOut = true;
            for (const raw of lineResult.stdout.split("\n")) {
                const parsed = /^(.+?):(\d+):(.*)$/.exec(raw);
                if (!parsed)
                    continue;
                const path = toPosix(parsed[1]);
                const lineNumber = Number(parsed[2]);
                const text = (parsed[3] ?? "").trim();
                if (!path || !lineNumber)
                    continue;
                const entry = matches.get(path) ?? { path, lines: new Map() };
                if (!entry.lines.has(lineNumber))
                    entry.lines.set(lineNumber, text);
                matches.set(path, entry);
            }
            if (Date.now() >= options.deadline || options.signal?.aborted)
                break;
        }
    };
    await collect(tokens, null);
    if (timedOut || options.signal?.aborted || Date.now() >= options.deadline) {
        return { candidates: [], matchedFiles: matches.size, fileCount: matches.size, waves, timedOut: true };
    }
    const idfDenominator = () => stage === "v0" || stage === "climb1"
        ? matches.size || 1
        : Math.max(totalUnionFiles, matches.size, 64);
    let weights = weightsFor(tokens, fileSets, idfDenominator());
    let candidates = await buildCandidates(root, matches, tokens, weights, limits, concepts);
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
        weights = weightsFor(tokens, fileSets, idfDenominator());
        candidates = await buildCandidates(root, matches, tokens, weights, limits, concepts);
    }
    const ranked = [];
    const fileWindowCounts = new Map();
    const maxWindowsPerFile = stage === "climb3" ? 3 : 1;
    for (const candidate of candidates.sort((a, b) => b.lexicalScore - a.lexicalScore || a.path.localeCompare(b.path))) {
        const count = fileWindowCounts.get(candidate.path) ?? 0;
        if (count >= maxWindowsPerFile)
            continue;
        fileWindowCounts.set(candidate.path, count + 1);
        ranked.push(candidate);
        if (ranked.length >= limits.candidates)
            break;
    }
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
        const weight = Math.max(0.2, Math.log2((Math.max(totalFiles, df) + 1) / (df + 1)) + 0.4);
        raw.set(token, weight);
        max = Math.max(max, weight);
    }
    for (const [token, weight] of raw)
        raw.set(token, Math.max(0.15, weight / (max || 1)));
    return raw;
}
function pathSubtokens(path) {
    const lowerPath = path.toLowerCase();
    const fileName = lowerPath.split("/").at(-1) ?? lowerPath;
    const stem = fileName.replace(/\.[^.]+$/, "");
    const stemParts = new Set([stem, stemToken(stem)]);
    for (const part of splitIdentifier(stem)) {
        stemParts.add(part);
        stemParts.add(stemToken(part));
    }
    const all = new Set(stemParts);
    for (const seg of lowerPath.split("/")) {
        const clean = seg.replace(/\.[^.]+$/, "");
        if (!clean)
            continue;
        all.add(clean);
        all.add(stemToken(clean));
        for (const part of splitIdentifier(clean)) {
            all.add(part);
            all.add(stemToken(part));
        }
    }
    return { all, stem, stemParts };
}
function weightedPathScore(tokens, weights, path, concepts = null) {
    if (!concepts) {
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
    const parsed = pathSubtokens(path);
    let score = 0;
    for (const concept of concepts) {
        const weight = Math.max(...concept.forms.map((form) => weights.get(form) ?? 0.4));
        const roleMultiplier = concept.role === "domain" ? 1.0 : 0.45;
        if (concept.forms.some((form) => parsed.stem === form || stemToken(parsed.stem) === form)) {
            score += 4.2 * weight * roleMultiplier;
        }
        else if (concept.forms.some((form) => parsed.stemParts.has(form))) {
            score += 3.0 * weight * roleMultiplier;
        }
        else if (concept.forms.some((form) => parsed.all.has(form))) {
            score += 1.6 * weight * roleMultiplier;
        }
    }
    return score;
}
function specificity(path) {
    if (/(^|\/)(i18n|locale|locales|lang|translations)\//i.test(path))
        return -2.5;
    if (/\.(md|mdx|txt|rst|adoc|\d)$/i.test(path) || /(^|\/)docs?\//i.test(path))
        return -1.4;
    if (/\.(test|spec|stories|fixture)\.[a-z]+$/i.test(path) || /(^|\/)(tests?|__tests__|e2e|fixtures|examples)\//i.test(path))
        return -0.9;
    if (/\.(json|jsonl|lock|yaml|yml|toml)$/i.test(path))
        return -0.8;
    return 0;
}
async function buildCandidates(root, matches, tokens, weights, limits, concepts) {
    const stage = limits.ablationStage ?? "climb3";
    const enrichContext = stage === "climb3";
    const candidates = [];
    const entries = [...matches.values()];
    const enrichPaths = new Set();
    if (enrichContext) {
        const rankedFiles = entries
            .map((file) => ({
            path: file.path,
            score: weightedPathScore(tokens, weights, file.path, concepts) +
                Math.min(file.lines.size, 15) * 0.25 +
                specificity(file.path),
        }))
            .sort((a, b) => b.score - a.score)
            .slice(0, 72);
        for (const item of rankedFiles)
            enrichPaths.add(item.path);
    }
    const fileLinesCache = new Map();
    if (enrichContext && enrichPaths.size > 0) {
        await Promise.all([...enrichPaths].map(async (relPath) => {
            try {
                const text = await readFile(join(root, relPath), "utf8");
                if (text.length <= limits.maxFileBytes && !text.slice(0, 2048).includes("\0")) {
                    const split = text.split(/\r?\n/);
                    let testStartLine = null;
                    for (let i = 0; i < split.length; i += 1) {
                        if (/^\s*#\[cfg\(test\)\]/.test(split[i] ?? "")) {
                            testStartLine = i + 1;
                            break;
                        }
                    }
                    fileLinesCache.set(relPath, { lines: split, testStartLine });
                }
            }
            catch {
                // ignore unreadable files
            }
        }));
    }
    for (const file of entries) {
        const lines = [...file.lines.keys()].sort((a, b) => a - b);
        if (lines.length === 0)
            continue;
        const cached = fileLinesCache.get(file.path) ?? null;
        const fullFileLines = cached?.lines ?? null;
        const windows = stage === "v0" || stage === "climb1"
            ? groupIntoWindowsV0(lines, limits.windowLines)
            : groupIntoWindowsDisjoint(lines, limits.windowLines, fullFileLines, enrichContext);
        const perFile = [];
        for (const window of windows) {
            let excerpt;
            if (fullFileLines) {
                const slice = [];
                const start = Math.max(1, window.start);
                const end = Math.min(fullFileLines.length, window.end);
                for (let lineNo = start; lineNo <= end; lineNo += 1) {
                    slice.push(`${lineNo}: ${fullFileLines[lineNo - 1] ?? ""}`);
                }
                excerpt = slice.join("\n");
            }
            else {
                excerpt = lines
                    .filter((line) => line >= window.start && line <= window.end)
                    .map((line) => `${line}: ${file.lines.get(line) ?? ""}`)
                    .join("\n");
            }
            let lexical = stage === "v0" || stage === "climb1"
                ? lexicalScoreV0(tokens, weights, file.path, excerpt, window)
                : lexicalScoreBM25F(tokens, weights, file.path, excerpt, window, concepts);
            if (cached?.testStartLine && window.start >= cached.testStartLine) {
                lexical = Math.round(lexical * 0.55 * 1000) / 1000;
            }
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
        const nonOverlapping = perFile.slice(0, 6);
        if (stage === "climb3") {
            nonOverlapping.forEach((cand, idx) => {
                if (idx === 1)
                    cand.lexicalScore = Math.round(cand.lexicalScore * 0.88 * 1000) / 1000;
                else if (idx >= 2)
                    cand.lexicalScore = Math.round(cand.lexicalScore * 0.78 * 1000) / 1000;
            });
        }
        candidates.push(...nonOverlapping);
    }
    return candidates;
}
function groupIntoWindowsV0(lines, maxLines) {
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
function isAnchorLine(lineText) {
    return /^\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?(?:fn|struct|enum|impl|trait|mod)\s+[A-Za-z_]|^\s*let\s+[A-Za-z_][A-Za-z0-9_]*\s*=\s*\{|^\s*export\s+(?:async\s+)?(?:function|class|const|interface|type)\s+[A-Za-z_]|^\s*[A-Za-z_][A-Za-z0-9_]*\s*:\s*Effect\.fn\b/.test(lineText);
}
function groupIntoWindowsDisjoint(lines, maxLines, fullFileLines, enrichContext) {
    const preContext = CONTEXT_LINES;
    const postContext = enrichContext ? 12 : CONTEXT_LINES;
    const totalFileLines = fullFileLines ? fullFileLines.length : null;
    const windows = [];
    for (const line of lines) {
        const lineText = fullFileLines ? (fullFileLines[line - 1] ?? "") : "";
        const anchor = enrichContext && isAnchorLine(lineText);
        const start = anchor ? Math.max(1, line - 2) : Math.max(1, line - preContext);
        const rawEnd = anchor ? line + maxLines - 3 : line + postContext;
        const end = totalFileLines ? Math.min(totalFileLines, rawEnd) : rawEnd;
        const last = windows.at(-1);
        const mergedEnd = last ? Math.max(last.end, end) : 0;
        if (anchor && last && line > last.start + 6) {
            last.end = Math.min(last.end, line - 1);
            const clampedEnd = Math.min(end, start + maxLines - 1);
            windows.push({ start, end: Math.max(start, clampedEnd) });
            continue;
        }
        if (last && start <= last.end + 1 && mergedEnd - last.start + 1 <= maxLines) {
            last.end = mergedEnd;
        }
        else if (last && line <= last.end) {
            continue;
        }
        else {
            const nextStart = last ? Math.max(start, last.end + 1) : start;
            const clampedEnd = Math.min(end, nextStart + maxLines - 1);
            windows.push({ start: nextStart, end: Math.max(nextStart, clampedEnd) });
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
function tokenizeCodeLine(text) {
    const set = new Set();
    const identifiers = [];
    for (const raw of text.match(/[A-Za-z_$][A-Za-z0-9_$.]*/g) ?? []) {
        const idSet = new Set();
        for (const seg of raw.split(".")) {
            if (!seg)
                continue;
            const lower = seg.toLowerCase();
            set.add(lower);
            set.add(stemToken(lower));
            idSet.add(lower);
            idSet.add(stemToken(lower));
            for (const part of splitIdentifier(seg)) {
                if (part.length >= 2) {
                    set.add(part);
                    set.add(stemToken(part));
                    idSet.add(part);
                    idSet.add(stemToken(part));
                }
            }
        }
        if (idSet.size > 1)
            identifiers.push(idSet);
    }
    return { tokens: set, identifiers };
}
export function lexicalScore(tokens, weights, path, excerpt, range) {
    return lexicalScoreBM25F(tokens, weights, path, excerpt, range, null);
}
function lexicalScoreV0(tokens, weights, path, excerpt, range) {
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
    const lines = excerpt.split("\n");
    const translationLines = lines.filter((line) => /^\s*\d+:\s*"[^"]{1,80}"\s*:/.test(line)).length;
    if (lines.length > 0 && translationLines / lines.length > 0.3)
        score *= 0.25;
    if (/(^|\/)(i18n|locale|locales|lang|translations)\//i.test(path))
        score *= 0.3;
    if (/(^|\/)(generated|dist|vendor)\//i.test(path) || /\.gen\.[a-z]+$/i.test(path))
        score *= 0.7;
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
function lexicalScoreBM25F(tokens, weights, path, excerpt, _range, conceptsInput) {
    const concepts = conceptsInput ??
        tokens.map((token) => ({
            id: stemToken(token),
            forms: [token, stemToken(token)],
            role: "domain",
        }));
    const parsedPath = pathSubtokens(path);
    const rawLines = excerpt.split("\n");
    const parsedLines = rawLines.map((raw) => {
        const text = raw.replace(/^\d+:\s*/, "");
        const trimmed = text.trim();
        const isImport = /^(import|from|use |require\(|#include|export .* from)/.test(trimmed);
        const isComment = /^(\/\/|#|\*|\/\*)/.test(trimmed);
        const isDefinition = DEFINITION.test(trimmed);
        const { tokens: lineTokens, identifiers } = tokenizeCodeLine(text);
        return {
            trimmed,
            tokens: lineTokens,
            identifiers,
            isImport,
            isComment,
            isDefinition,
        };
    });
    let pathScore = 0;
    let exactStemMatched = false;
    let codeScore = 0;
    let matchedWeight = 0;
    let matchedDomainConcepts = 0;
    let matchedCodeConcepts = 0;
    let definitionHits = 0;
    for (const concept of concepts) {
        const baseWeight = Math.max(...concept.forms.map((form) => weights.get(form) ?? 0.45));
        const roleFactor = concept.role === "domain" ? 1.0 : concept.role === "implied" ? 0.9 : 0.45;
        const weight = baseWeight * roleFactor;
        let inPath = false;
        if (concept.forms.some((form) => parsedPath.stem === form || stemToken(parsedPath.stem) === form)) {
            inPath = true;
            exactStemMatched = true;
            pathScore += 2.4 * weight;
        }
        else if (concept.forms.some((form) => parsedPath.stemParts.has(form))) {
            inPath = true;
            pathScore += 1.6 * weight;
        }
        else if (concept.forms.some((form) => parsedPath.all.has(form))) {
            inPath = true;
            pathScore += 0.85 * weight;
        }
        let tf = 0;
        let hitDef = false;
        let hitExec = false;
        let hitComment = false;
        for (const line of parsedLines) {
            if (!concept.forms.some((form) => line.tokens.has(form)))
                continue;
            if (line.isImport) {
                tf += 0.12;
            }
            else if (line.isComment) {
                tf += 0.45;
                hitComment = true;
            }
            else if (line.isDefinition) {
                tf += 1.85;
                hitDef = true;
                hitExec = true;
            }
            else {
                tf += 1.2;
                hitExec = true;
            }
        }
        const saturatedTf = tf > 0 ? (tf * 2.6) / (tf + 1.6) : 0;
        codeScore += saturatedTf * weight;
        const codeQuality = hitExec ? 1.0 : hitComment ? 0.35 : tf > 0 ? 0.12 : 0;
        if (codeQuality > 0) {
            matchedCodeConcepts += codeQuality;
            if (hitDef)
                definitionHits += 1;
        }
        const conceptQuality = Math.max(codeQuality, inPath ? 0.65 : 0);
        if (conceptQuality > 0) {
            matchedWeight += weight * conceptQuality;
            if (concept.role === "domain" || concept.role === "implied") {
                matchedDomainConcepts += conceptQuality;
            }
        }
    }
    // Compound symbol match: single identifier or dotted call joining >=2 distinct query concepts
    // e.g. `defaultModel`, `Model.default`, `exceeds_max_columns`, `add_ignore`, `ignore_file`
    let compoundBonus = 0;
    for (const line of parsedLines) {
        if (line.isImport)
            continue;
        for (const idSet of line.identifiers) {
            let idConcepts = 0;
            for (const concept of concepts) {
                if (concept.forms.some((form) => idSet.has(form)))
                    idConcepts += 1;
            }
            if (idConcepts >= 3)
                compoundBonus = Math.max(compoundBonus, 2.2);
            else if (idConcepts === 2)
                compoundBonus = Math.max(compoundBonus, line.isDefinition ? 1.6 : 1.1);
        }
    }
    const domainCount = Math.max(1, concepts.filter((c) => c.role !== "framing").length);
    const coverageRatio = matchedDomainConcepts / domainCount;
    const codeCoverageRatio = matchedCodeConcepts / Math.max(1, concepts.length);
    const coordinationBonus = matchedWeight * (0.65 + 1.35 * coverageRatio + 0.65 * codeCoverageRatio) +
        (definitionHits >= 2 ? 0.75 : definitionHits === 1 ? 0.3 : 0) +
        compoundBonus +
        (exactStemMatched && matchedCodeConcepts >= 2 && definitionHits >= 1 ? 1.1 : 0);
    let score = Math.min(pathScore, 6.5) * 1.25 + codeScore + coordinationBonus;
    const nonCommentCodeLines = parsedLines.filter((l) => !l.isComment && !l.isImport && l.trimmed.length > 2).length;
    if (matchedCodeConcepts === 0) {
        score *= 0.25;
    }
    else if (nonCommentCodeLines <= 3 && parsedLines.some((l) => /^&\w+(\.\w+)*$/.test(l.trimmed))) {
        score *= 0.62;
    }
    const translationLines = rawLines.filter((line) => /^\s*\d+:\s*"[^"]{1,80}"\s*:/.test(line)).length;
    if (rawLines.length > 0 && translationLines / rawLines.length > 0.3)
        score *= 0.25;
    if (/(^|\/)(i18n|locale|locales|lang|translations)\//i.test(path))
        score *= 0.25;
    if (/(^|\/)(generated|dist|vendor)\//i.test(path) || /\.gen\.[a-z]+$/i.test(path))
        score *= 0.65;
    if (/\.(md|mdx|txt|rst|adoc|\d)$/i.test(path) || /(^|\/)(docs?|doc)\//i.test(path))
        score *= 0.4;
    if (/\.(test|spec|stories|fixture)\.[a-z]+$/i.test(path) ||
        /(^|\/)(tests?|__tests__|e2e|fixtures|examples|complete)\//i.test(path)) {
        score *= 0.5;
    }
    if (/\.(json|jsonl|lock|yaml|yml|toml|zsh|bash|fish|ps1)$/i.test(path))
        score *= 0.55;
    return Math.round(score * 1000) / 1000;
}
export async function readCandidateExcerpt(root, candidate, maxBytes) {
    const absolute = join(root, candidate.path);
    let buffer;
    try {
        const realRoot = await realpath(root);
        const realFile = await realpath(absolute);
        const rootPrefix = realRoot.endsWith("/") ? realRoot : `${realRoot}/`;
        if (!realFile.startsWith(rootPrefix))
            return null;
        buffer = await readFile(realFile);
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
    const digest = createHash("sha256").update(buffer).digest("hex");
    return {
        text: sections.map((section) => section.text).join("\n…\n"),
        digest,
        ranges: sections.map((section) => section.range),
        sections,
    };
}
