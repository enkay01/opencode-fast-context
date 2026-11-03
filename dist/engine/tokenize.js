const STOPWORDS_V0 = new Set(`a an the and or but if then else for to of in on at by with from into as is are was were be been being
   this that these those it its their there here what where which who whom whose why how when does do did
   done can could should would will shall may might must not no nor so than too very just also only
   about above after again against all am any because before below between both each few further had has
   have having he her his i me more most my our out over own same she some such they them up us we you your
   code file files line lines function functions return returns implementation implemented implement
   project projects app apps application use used using get gets set sets new create creates make makes
   work works working handler handle handles support supports run runs running`
    .split(/\s+/)
    .filter(Boolean));
const STOPWORDS = new Set([
    ...STOPWORDS_V0,
    "one",
    "ones",
    "turn",
    "turns",
    "turned",
    "turning",
]);
export const FRAMING_VERBS = new Set([
    "decide",
    "decides",
    "choose",
    "chooses",
    "whether",
    "defined",
    "define",
    "defines",
    "apply",
    "applies",
    "obey",
    "obeys",
    "contribute",
    "contributes",
    "build",
    "builds",
    "reuse",
    "reuses",
]);
const CODE_SYNONYMS = new Map([
    ["configuration", ["config"]],
    ["configurations", ["config"]],
    ["configure", ["config"]],
    ["configured", ["config"]],
    ["directory", ["dir"]],
    ["directories", ["dir"]],
    ["walker", ["walk"]],
    ["authentication", ["auth"]],
    ["repository", ["repo"]],
    ["repositories", ["repo"]],
    ["environment", ["env"]],
    ["specification", ["spec"]],
    ["documentation", ["doc"]],
    ["permissions", ["permission"]],
]);
const IDENTIFIER = /[A-Za-z_$][A-Za-z0-9_$]*/g;
const COMPOUND_FLAG = /(?:--?[A-Za-z0-9][A-Za-z0-9_-]+|[A-Za-z_$][A-Za-z0-9_$]*-[A-Za-z0-9_$-]+)/g;
/**
 * Original v0 tokenizer kept for reproducible ablation comparisons.
 */
export function tokenizeV0(query) {
    const terms = new Set();
    const quoted = query.matchAll(/"([^"]{2,80})"|`([^`]{2,80})`/g);
    for (const match of quoted) {
        const phrase = (match[1] ?? match[2])?.trim();
        if (phrase)
            terms.add(phrase);
    }
    for (const raw of query.match(IDENTIFIER) ?? []) {
        const token = raw.toLowerCase();
        if (token.length < 2 || STOPWORDS_V0.has(token))
            continue;
        terms.add(token);
        for (const part of splitIdentifier(raw)) {
            if (part.length >= 3 && !STOPWORDS_V0.has(part))
                terms.add(part);
        }
    }
    return [...terms].slice(0, 24);
}
/**
 * Deterministic morphological stemmer for code identifiers and query nouns.
 */
export function stemToken(token) {
    const lower = token.toLowerCase();
    if (lower.length <= 3)
        return lower;
    if (lower.endsWith("ies") && lower.length > 4)
        return `${lower.slice(0, -3)}y`;
    if (lower.endsWith("es") && /(?:s|x|z|ch|sh)es$/.test(lower))
        return lower.slice(0, -2);
    if (lower.endsWith("s") && !/(?:ss|us|is|as|os)$/.test(lower))
        return lower.slice(0, -1);
    if (lower.endsWith("ied") && lower.length > 4)
        return `${lower.slice(0, -3)}y`;
    if (lower.endsWith("ed") && lower.length >= 6) {
        if (/(?:ated|ured|iled|oled|umed|uned|ored|ined|yped)$/.test(lower))
            return lower.slice(0, -1);
        if (!/eed$/.test(lower))
            return lower.slice(0, -2);
    }
    if (lower.endsWith("ing") && lower.length > 6)
        return lower.slice(0, -3);
    return lower;
}
/**
 * Turn a developer question into searchable terms. Keeps identifiers, quoted
 * phrases, hyphenated flags, and morphological stems; drops prose filler.
 */
export function tokenize(query) {
    const terms = new Set();
    const quoted = query.matchAll(/"([^"]{2,80})"|`([^`]{2,80})`/g);
    for (const match of quoted) {
        const phrase = (match[1] ?? match[2])?.trim();
        if (phrase)
            terms.add(phrase);
    }
    for (const match of query.matchAll(COMPOUND_FLAG)) {
        const cleaned = match[0].replace(/^--?/, "").toLowerCase();
        if (cleaned.length >= 3 && cleaned.includes("-")) {
            const snake = cleaned.replace(/-/g, "_");
            if (!STOPWORDS.has(snake))
                terms.add(snake);
        }
    }
    for (const raw of query.match(IDENTIFIER) ?? []) {
        const token = raw.toLowerCase();
        if (token.length < 2 || STOPWORDS.has(token))
            continue;
        terms.add(token);
        const stem = stemToken(token);
        if (stem.length >= 3 && !STOPWORDS.has(stem))
            terms.add(stem);
        for (const syn of CODE_SYNONYMS.get(token) ?? CODE_SYNONYMS.get(stem) ?? []) {
            if (!STOPWORDS.has(syn))
                terms.add(syn);
        }
        for (const part of splitIdentifier(raw)) {
            if (part.length >= 3 && !STOPWORDS.has(part)) {
                terms.add(part);
                const partStem = stemToken(part);
                if (partStem.length >= 3 && !STOPWORDS.has(partStem))
                    terms.add(partStem);
            }
        }
    }
    if (/\bmemory\s+maps?\b/i.test(query)) {
        terms.add("mmap");
    }
    if (/\b(?:did\s+not|didn't|without|not\s+request|not\s+specify|no\s+\w+\s+is\s+set|when\s+none)\b/i.test(query)) {
        terms.add("default");
    }
    return [...terms].slice(0, 24);
}
/**
 * Group query terms into canonical semantic concepts so morphological variants
 * (e.g. "tools" and "tool", or "configuration" and "config") count as one
 * concept rather than double-counting.
 */
export function extractConcepts(query, repoName = "") {
    const byId = new Map();
    const repoLower = repoName.toLowerCase();
    const repoStem = stemToken(repoLower);
    const addConcept = (id, form, role) => {
        if (!id || id.length < 2 || STOPWORDS.has(id))
            return;
        if (repoLower && (id === repoLower || id === repoStem || form === repoLower))
            return;
        if (repoLower === "opencode" && (id === "open" || form === "open"))
            return;
        const existing = byId.get(id);
        if (existing) {
            existing.forms.add(form);
            existing.forms.add(id);
            if (role === "domain")
                existing.role = "domain";
            return;
        }
        byId.set(id, { forms: new Set([id, form]), role });
    };
    for (const match of query.matchAll(COMPOUND_FLAG)) {
        const cleaned = match[0].replace(/^--?/, "").toLowerCase();
        if (cleaned.length >= 3 && cleaned.includes("-")) {
            const snake = cleaned.replace(/-/g, "_");
            addConcept(snake, snake, "domain");
        }
    }
    for (const raw of query.match(IDENTIFIER) ?? []) {
        const lower = raw.toLowerCase();
        if (lower.length < 2 || STOPWORDS.has(lower))
            continue;
        if (repoLower && lower === repoLower)
            continue;
        const parts = splitIdentifier(raw);
        if (parts.length > 1) {
            for (const part of parts) {
                if (part.length < 3 || STOPWORDS.has(part))
                    continue;
                const pStem = stemToken(part);
                const role = FRAMING_VERBS.has(part) || FRAMING_VERBS.has(pStem) ? "framing" : "domain";
                addConcept(pStem, part, role);
            }
        }
        const stem = stemToken(lower);
        const canonical = (CODE_SYNONYMS.get(lower) ?? CODE_SYNONYMS.get(stem))?.[0] ?? stem;
        const role = FRAMING_VERBS.has(lower) || FRAMING_VERBS.has(stem) ? "framing" : "domain";
        addConcept(canonical, lower, role);
        if (stem !== canonical) {
            byId.get(canonical)?.forms.add(stem);
        }
        if (lower === "maximum" || stem === "maximum") {
            byId.get(canonical)?.forms.add("max");
        }
        if (lower === "minimum" || stem === "minimum") {
            byId.get(canonical)?.forms.add("min");
        }
        for (const syn of CODE_SYNONYMS.get(lower) ?? CODE_SYNONYMS.get(stem) ?? []) {
            byId.get(canonical)?.forms.add(syn);
        }
    }
    if (/\bmemory\s+maps?\b/i.test(query)) {
        const memConcept = byId.get("memory");
        if (memConcept) {
            memConcept.forms.add("mmap");
        }
        else {
            addConcept("mmap", "mmap", "domain");
        }
    }
    if (/\b(?:did\s+not|didn't|without|not\s+request|not\s+specify|no\s+\w+\s+is\s+set|when\s+none)\b/i.test(query)) {
        addConcept("default", "default", "implied");
    }
    return [...byId.entries()].slice(0, 16).map(([id, value]) => ({
        id,
        forms: [...value.forms],
        role: value.role,
    }));
}
export function splitIdentifier(identifier) {
    return identifier
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/[_-]+/g, " ")
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);
}
const NOISE_IDENTIFIERS = new Set([
    "const",
    "let",
    "var",
    "function",
    "return",
    "import",
    "export",
    "from",
    "class",
    "interface",
    "type",
    "async",
    "await",
    "string",
    "number",
    "boolean",
    "undefined",
    "null",
    "true",
    "false",
    "this",
    "self",
    "props",
    "data",
    "value",
    "result",
    "error",
    "options",
    "object",
    "record",
    "array",
    "Promise",
]);
/**
 * Pull identifiers that appear in selected code, so a second search wave can
 * follow a name into the files that define or use it.
 */
export function identifiersIn(code, limit = 12) {
    const counts = new Map();
    for (const raw of code.match(IDENTIFIER) ?? []) {
        if (raw.length < 4 || NOISE_IDENTIFIERS.has(raw))
            continue;
        counts.set(raw, (counts.get(raw) ?? 0) + 1);
    }
    return [...counts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, limit)
        .map(([name]) => name);
}
