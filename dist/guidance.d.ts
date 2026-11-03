export type AutoInvoke = "suggest" | "off";
export declare const AUTO_INVOKE_GUIDANCE: string;
export declare function normalizeAutoInvoke(value: unknown): AutoInvoke;
export interface SystemTextPart {
    type: "text";
    text: string;
}
/**
 * Add the tool-selection guidance once. Replaying the context hook must not duplicate it.
 */
export declare function applyAutoInvokeGuidance(system: ReadonlyArray<SystemTextPart>, mode: AutoInvoke): boolean;
