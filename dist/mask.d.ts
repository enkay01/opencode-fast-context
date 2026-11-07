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
export declare const SECRET_MASK = "\u2022";
export interface MaskState {
    /** Characters of the real secret collected so far. */
    secret: string;
    /** What the input currently displays: SECRET_MASK repeated secret.length times. */
    shown: string;
    /** Caret position for the masked buffer after the edit. */
    cursor: number;
}
export declare function createMaskState(): MaskState;
export declare function applyMaskDelta(state: MaskState, text: string, cursor?: number): MaskState;
