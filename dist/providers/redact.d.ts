export interface SanitizedPayload {
    ok: boolean;
    text: string;
    redactions: number;
    reason?: string;
}
/**
 * Reject private key material and redact common credential forms before source
 * leaves the machine. Unknown secrets cannot be detected; this is defence in
 * depth, not a guarantee.
 */
export declare function sanitizeForProvider(text: string): SanitizedPayload;
