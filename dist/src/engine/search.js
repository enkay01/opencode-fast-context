import { DEFAULT_LIMITS } from "../types.js";
import { discover, readCandidateExcerpt } from "./discover.js";
export async function searchRepository(options) {
    const started = Date.now();
    const limits = {
        ...DEFAULT_LIMITS,
        ...options.limits,
        ...(options.maxFiles ? { maxFiles: options.maxFiles } : {}),
    };
    const deadline = started + limits.deadlineMs;
    const query = options.query.trim();
    const providerInfo = {
        id: options.provider?.id ?? "none",
        model: options.provider?.model ?? null,
        usage: null,
    };
    const result = (status, evidence, extra = {}) => {
        const total = Date.now() - started;
        return {
            version: 1,
            query,
            status,
            results: evidence,
            truncated: extra.truncated ?? false,
            candidateCount: extra.candidateCount ?? 0,
            provider: extra.provider ?? providerInfo,
            timings: { discovery: extra.timings?.discovery ?? 0, ranking: extra.timings?.ranking ?? 0, total },
            ...(extra.reason ? { reason: extra.reason } : {}),
        };
    };
    if (!query) {
        return result("no_match", [], { reason: "empty query" });
    }
    if (options.signal?.aborted) {
        return result("cancelled", [], { reason: "cancelled before search" });
    }
    options.onStage?.("discovery");
    const discoveryStart = Date.now();
    const discovery = await discover(options.root, query, limits, {
        deadline,
        ...(options.signal ? { signal: options.signal } : {}),
    });
    const discoveryMs = Date.now() - discoveryStart;
    if (options.signal?.aborted) {
        return result("cancelled", [], { candidateCount: discovery.candidates.length, timings: { discovery: discoveryMs, ranking: 0, total: 0 } });
    }
    if (discovery.candidates.length === 0) {
        return result("no_match", [], {
            candidateCount: 0,
            timings: { discovery: discoveryMs, ranking: 0, total: 0 },
            ...(discovery.timedOut ? { reason: "discovery deadline expired" } : { reason: "no lexical candidates" }),
        });
    }
    const lexicalPool = discovery.candidates;
    let ranked = lexicalPool.map((candidate) => ({ ...candidate, decisionScore: null }));
    let provider = providerInfo;
    let status = "complete";
    let reason;
    let rankingMs = 0;
    if (options.provider) {
        options.onStage?.("ranking");
        const rankingStart = Date.now();
        const shortlist = lexicalPool.slice(0, limits.rankedCandidates);
        const scoredCandidates = await Promise.all(shortlist.map(async (candidate) => ({
            candidate,
            checked: await readCandidateExcerpt(options.root, candidate, limits.maxFileBytes),
        })));
        const sendable = scoredCandidates.filter((item) => item.checked !== null).slice(0, limits.rankedCandidates);
        try {
            const scoring = await options.provider.score(query, sendable.map(({ candidate, checked }) => ({
                id: candidate.id,
                path: candidate.path,
                code: checked?.text ?? candidate.excerpt,
            })), {
                deadline,
                concurrency: limits.concurrency,
                ...(options.signal ? { signal: options.signal } : {}),
            });
            provider = {
                id: options.provider.id,
                model: scoring.model,
                usage: scoring.usage,
            };
            const maxLexical = Math.max(...lexicalPool.map((candidate) => candidate.lexicalScore), 1);
            ranked = lexicalPool
                .map((candidate) => {
                const decision = scoring.scores[candidate.id];
                if (decision === undefined)
                    return { candidate, blend: candidate.lexicalScore / maxLexical };
                const blended = decision * 0.7 + (candidate.lexicalScore / maxLexical) * 0.3;
                return { candidate, blend: blended, decision };
            })
                .sort((a, b) => b.blend - a.blend || a.candidate.path.localeCompare(b.candidate.path))
                .map(({ candidate, decision }) => ({ ...candidate, decisionScore: decision ?? null }));
            if (scoring.skipped > 0) {
                status = "partial";
                reason = `${scoring.skipped} candidates were not scored before the deadline or after a provider error`;
            }
        }
        catch (error) {
            rankingMs = Date.now() - rankingStart;
            status = "fallback_required";
            reason = `decision provider ${options.provider.id} failed: ${error.message}`;
            ranked = lexicalPool.map((candidate) => ({ ...candidate, decisionScore: null }));
        }
        rankingMs = Date.now() - rankingStart;
    }
    else {
        ranked = lexicalPool.map((candidate) => ({ ...candidate, decisionScore: null }));
    }
    if (options.signal?.aborted) {
        return result("cancelled", [], {
            candidateCount: discovery.candidates.length,
            timings: { discovery: discoveryMs, ranking: rankingMs, total: 0 },
            provider,
        });
    }
    options.onStage?.("evidence");
    const evidence = [];
    let usedLines = 0;
    let truncated = false;
    for (const candidate of ranked) {
        if (evidence.length >= limits.maxFiles) {
            truncated = true;
            break;
        }
        if (evidence.some((item) => item.path === candidate.path))
            continue;
        const checked = await readCandidateExcerpt(options.root, candidate, limits.maxFileBytes);
        if (!checked)
            continue;
        const remaining = limits.maxLines - usedLines;
        if (remaining <= 0) {
            truncated = true;
            break;
        }
        const clipped = clipSections(checked.sections, remaining);
        if (clipped.sections.length === 0)
            continue;
        evidence.push({
            path: candidate.path,
            ranges: clipped.sections.map((section) => section.range),
            digest: checked.digest,
            excerpt: clipped.sections.map((section) => section.text).join("\n…\n"),
            scores: {
                lexical: round(candidate.lexicalScore),
                decision: candidate.decisionScore === null ? null : round(candidate.decisionScore),
            },
        });
        usedLines += clipped.lines;
        if (clipped.truncated)
            truncated = true;
    }
    if (evidence.length === 0) {
        return result("no_match", [], {
            candidateCount: discovery.candidates.length,
            timings: { discovery: discoveryMs, ranking: rankingMs, total: 0 },
            provider,
            reason: reason ?? "candidates were found but no readable evidence remained",
        });
    }
    if (discovery.candidates.length > evidence.length)
        truncated = true;
    return result(status, evidence, {
        truncated,
        candidateCount: discovery.candidates.length,
        provider,
        timings: { discovery: discoveryMs, ranking: rankingMs, total: 0 },
        ...(reason ? { reason } : {}),
        ...(discovery.timedOut ? { reason: reason ?? "discovery deadline expired; results may be incomplete" } : {}),
    });
}
function clipSections(sections, budget) {
    const kept = [];
    let remaining = budget;
    let truncated = false;
    for (const section of sections) {
        if (remaining <= 0) {
            truncated = true;
            break;
        }
        const lines = section.text.split("\n");
        const keep = Math.min(lines.length, remaining);
        if (keep < lines.length)
            truncated = true;
        kept.push({
            range: { start: section.range.start, end: section.range.start + keep - 1 },
            text: lines.slice(0, keep).join("\n"),
        });
        remaining -= keep;
    }
    return { sections: kept, lines: budget - remaining, truncated };
}
function round(value) {
    return Math.round(value * 1000) / 1000;
}
//# sourceMappingURL=search.js.map