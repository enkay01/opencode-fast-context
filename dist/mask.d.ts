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
export declare const SECRET_MASK = "\u2022";
export interface MaskState {
    /** Characters of the real secret collected so far. */
    secret: string;
    /** What the input currently displays: SECRET_MASK repeated secret.length times. */
    shown: string;
}
export declare function createMaskState(): MaskState;
export declare function applyMaskDelta(state: MaskState, text: string): MaskState;
