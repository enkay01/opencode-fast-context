import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export interface ExperimentVariant {
  id: string;
  generation: string;
  parent: string;
  mechanism: string;
  predictedMetric: string;
  registered: boolean;
}

export interface ExperimentManifest {
  version: 1;
  protocol: string;
  protocolHash: string;
  h0Commit: string;
  corpusPath: string;
  corpusVersion: string;
  arms: string[];
  stages: string[];
  providerBudgets: number[];
  variants: ExperimentVariant[];
}

export const MANIFEST_PATH = "bench/experiment/manifest.json";

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export async function protocolHash(root: string): Promise<string> {
  return sha256(await readFile(resolve(root, "EXPERIMENT_PROTOCOL.md"), "utf8"));
}

export async function corpusVersion(root: string, corpusPath: string): Promise<string> {
  return sha256(await readFile(resolve(root, corpusPath), "utf8"));
}

export async function loadManifest(root: string, path = MANIFEST_PATH): Promise<ExperimentManifest> {
  return JSON.parse(await readFile(resolve(root, path), "utf8")) as ExperimentManifest;
}

export interface RunValidationRecord {
  runId?: string;
  variantId?: string;
  arm?: string;
  corpusVersion?: string;
  protocolHash?: string;
  implementationCommit?: string;
  diagnostics?: unknown;
}

export interface RunValidationOptions {
  manifest: ExperimentManifest;
  /** Protocol and corpus hashes of the checkout doing the analysis. */
  currentProtocolHash: string;
  currentCorpusVersion: string;
}

/** Reject mixed, incomplete, duplicated, or unregistered run sets. */
export function validateRunRecords(
  records: RunValidationRecord[],
  options: RunValidationOptions,
): string[] {
  const errors: string[] = [];
  const { manifest } = options;
  if (manifest.protocolHash !== options.currentProtocolHash) {
    errors.push("manifest protocol hash does not match the committed protocol");
  }
  if (manifest.corpusVersion !== options.currentCorpusVersion) {
    errors.push("manifest corpus version does not match the committed corpus");
  }

  const allowedArms = new Set(manifest.arms);
  const allowedVariants = new Set([
    ...manifest.variants.map((variant) => variant.id),
    ...manifest.stages,
  ]);
  const seen = new Set<string>();
  const commits = new Set<string>();

  for (const [index, record] of records.entries()) {
    const label = record.runId ?? `record ${index}`;
    if (!record.runId) errors.push(`${label}: missing runId`);
    else if (seen.has(record.runId)) errors.push(`${label}: duplicate runId`);
    else seen.add(record.runId);

    if (!record.arm || !allowedArms.has(record.arm)) {
      errors.push(`${label}: unregistered arm ${String(record.arm)}`);
    }
    if (!record.variantId || !allowedVariants.has(record.variantId)) {
      errors.push(`${label}: unregistered variant ${String(record.variantId)}`);
    }
    if (record.corpusVersion !== options.currentCorpusVersion) {
      errors.push(`${label}: mixed corpus version ${String(record.corpusVersion)}`);
    }
    if (record.protocolHash !== options.currentProtocolHash) {
      errors.push(`${label}: protocol hash mismatch`);
    }
    if (!record.implementationCommit) {
      errors.push(`${label}: missing implementation commit`);
    } else {
      commits.add(record.implementationCommit);
    }
    if (record.diagnostics === undefined) {
      errors.push(`${label}: missing stage diagnostics`);
    }
  }

  if (commits.size > 1) {
    errors.push(`mixed implementation commits: ${[...commits].join(", ")}`);
  }
  return errors;
}
