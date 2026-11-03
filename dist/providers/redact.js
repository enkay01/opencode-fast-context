const PRIVATE_KEY_BLOCK = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/;
const PEM_MARKER = /-----BEGIN [A-Z0-9 ]*(PRIVATE KEY|CERTIFICATE)-----/;
const REDACTIONS = [
    { pattern: /AKIA[0-9A-Z]{16}/g, replacement: "[REDACTED_AWS_KEY]" },
    { pattern: /gh[pousr]_[A-Za-z0-9]{20,}/g, replacement: "[REDACTED_GITHUB_TOKEN]" },
    { pattern: /github_pat_[A-Za-z0-9_]{20,}/g, replacement: "[REDACTED_GITHUB_TOKEN]" },
    { pattern: /xox[abprs]-[A-Za-z0-9-]{10,}/g, replacement: "[REDACTED_SLACK_TOKEN]" },
    {
        pattern: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
        replacement: "[REDACTED_JWT]",
    },
    {
        pattern: /(authorization\s*[:=]\s*bearer\s+)[^\s"'`]+/gi,
        replacement: "$1[REDACTED]",
    },
    {
        pattern: /\b(api[_-]?key|access[_-]?key|client[_-]?secret|secret|token|password|passwd)\b(\s*[:=]\s*)["'`]?[A-Za-z0-9+/=_\-.]{8,}/gi,
        replacement: "$1$2[REDACTED]",
    },
];
function expand(replacement, args) {
    if (!replacement.includes("$"))
        return replacement;
    return replacement
        .replace("$1", String(args[1] ?? ""))
        .replace("$2", String(args[2] ?? ""));
}
/**
 * Reject private key material and redact common credential forms before source
 * leaves the machine. Unknown secrets cannot be detected; this is defence in
 * depth, not a guarantee.
 */
export function sanitizeForProvider(text) {
    if (PRIVATE_KEY_BLOCK.test(text)) {
        return { ok: false, text: "", redactions: 0, reason: "private key block" };
    }
    if (PEM_MARKER.test(text)) {
        return { ok: false, text: "", redactions: 0, reason: "certificate or key block" };
    }
    let redactions = 0;
    let output = text;
    for (const rule of REDACTIONS) {
        output = output.replace(rule.pattern, (...args) => {
            redactions += 1;
            return expand(rule.replacement, args);
        });
    }
    return { ok: true, text: output, redactions };
}
