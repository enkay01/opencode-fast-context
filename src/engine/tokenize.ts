const STOPWORDS = new Set(
  `a an the and or but if then else for to of in on at by with from into as is are was were be been being
   this that these those it its their there here what where which who whom whose why how when does do did
   done can could should would will shall may might must not no nor so than too very just also only
   about above after again against all am any because before below between both each few further had has
   have having he her his i me more most my our out over own same she some such they them up us we you your
   code file files line lines function functions return returns implementation implemented implement
   project projects app apps application use used using get gets set sets new create creates make makes
   work works working handler handle handles support supports run runs running`
    .split(/\s+/)
    .filter(Boolean),
);

const IDENTIFIER = /[A-Za-z_$][A-Za-z0-9_$]*/g;

/**
 * Turn a developer question into searchable terms. Keeps identifiers, quoted
 * phrases and path fragments; drops prose filler.
 */
export function tokenize(query: string): string[] {
  const terms = new Set<string>();
  const quoted = query.matchAll(/"([^"]{2,80})"|`([^`]{2,80})`/g);
  for (const match of quoted) {
    const phrase = (match[1] ?? match[2])?.trim();
    if (phrase) terms.add(phrase);
  }

  for (const raw of query.match(IDENTIFIER) ?? []) {
    const token = raw.toLowerCase();
    if (token.length < 2 || STOPWORDS.has(token)) continue;
    terms.add(token);
    for (const part of splitIdentifier(raw)) {
      if (part.length >= 3 && !STOPWORDS.has(part)) terms.add(part);
    }
  }

  return [...terms].slice(0, 24);
}

export function splitIdentifier(identifier: string): string[] {
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
export function identifiersIn(code: string, limit = 12): string[] {
  const counts = new Map<string, number>();
  for (const raw of code.match(IDENTIFIER) ?? []) {
    if (raw.length < 4 || NOISE_IDENTIFIERS.has(raw)) continue;
    counts.set(raw, (counts.get(raw) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([name]) => name);
}
