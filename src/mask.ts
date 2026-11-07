/**
 * Incremental masking for a single-line secret input.
 *
 * The input renderable displays `SECRET_MASK` once per secret character, so
 * the real key never stays visible. `applyMaskDelta` maps the edited buffer
 * back to the secret:
 *
 * - mask characters represent retained secret characters
 * - any other characters are the text the user just typed or pasted, and
 *   they are inserted where they appear in the buffer
 * - a buffer with no inserted text is a deletion, anchored at the caret so
 *   edits in the middle remove the intended character instead of the tail
 */
export const SECRET_MASK = "•";

export interface MaskState {
  /** Characters of the real secret collected so far. */
  secret: string;
  /** What the input currently displays: SECRET_MASK repeated secret.length times. */
  shown: string;
  /** Caret position for the masked buffer after the edit. */
  cursor: number;
}

export function createMaskState(): MaskState {
  return { secret: "", shown: "", cursor: 0 };
}

export function applyMaskDelta(state: MaskState, text: string, cursor = text.length): MaskState {
  const clean = (value: string) => value.replace(/[\s\u0000-\u001f]+/g, "");
  const raw = text.split(SECRET_MASK).join("");
  const inserted = clean(raw);
  const masked = text.length - raw.length;

  if (inserted.length > 0) {
    let first = 0;
    while (first < text.length && text[first] === SECRET_MASK) first += 1;
    const before = first;
    const after = Math.max(0, masked - before);
    const secret = clean(
      state.secret.slice(0, before) + inserted + state.secret.slice(Math.max(0, state.secret.length - after)),
    );
    return { secret, shown: SECRET_MASK.repeat(secret.length), cursor: Math.min(secret.length, before + inserted.length) };
  }

  const deleted = Math.max(0, state.secret.length - masked);
  const position = Math.max(0, Math.min(cursor, state.secret.length - deleted));
  const secret = clean(state.secret.slice(0, position) + state.secret.slice(position + deleted));
  return { secret, shown: SECRET_MASK.repeat(secret.length), cursor: Math.min(secret.length, position) };
}
