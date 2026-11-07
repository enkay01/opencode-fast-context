/**
 * Incremental masking for a single-line secret input.
 *
 * The input renderable always displays `MASK` repeated once per secret
 * character, so the real key never stays visible. `applyMaskDelta` maps each
 * new buffer content back to the underlying secret:
 *
 * - appended text after the current mask extends the secret
 * - a shorter buffer that is a prefix of the mask deletes trailing characters
 * - anything else (selection replace, mid-buffer edits, paste anomalies)
 *   falls back to the buffer with mask characters stripped
 */
export const SECRET_MASK = "•";

export interface MaskState {
  /** Characters of the real secret collected so far. */
  secret: string;
  /** What the input currently displays: SECRET_MASK repeated secret.length times. */
  shown: string;
}

export function createMaskState(): MaskState {
  return { secret: "", shown: "" };
}

export function applyMaskDelta(state: MaskState, text: string): MaskState {
  const clean = (value: string) => value.replace(/[\s\u0000-\u001f]+/g, "");
  let secret: string;
  if (text.startsWith(state.shown)) {
    secret = clean(state.secret + text.slice(state.shown.length));
  } else if (state.shown.startsWith(text)) {
    const removed = state.shown.length - text.length;
    secret = clean(state.secret.slice(0, Math.max(0, state.secret.length - removed)));
  } else {
    secret = clean(text.split(SECRET_MASK).join(""));
  }
  return { secret, shown: SECRET_MASK.repeat(secret.length) };
}
