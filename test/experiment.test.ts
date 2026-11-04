import assert from "node:assert/strict";
import { test } from "node:test";
import { validateRunRecords, type ExperimentManifest, type RunValidationRecord } from "../bench/experiment.ts";

const manifest: ExperimentManifest = {
  version: 1,
  protocol: "EXPERIMENT_PROTOCOL.md",
  protocolHash: "protocol-hash",
  h0Commit: "1137754",
  corpusPath: "bench/corpus/tasks.json",
  corpusVersion: "corpus-hash",
  arms: ["none", "jev", "clef"],
  stages: ["v0", "climb3"],
  providerBudgets: [24, 48],
  variants: [
    {
      id: "H1-48",
      generation: "H1",
      parent: "H0",
      mechanism: "provider budget",
      predictedMetric: "discovery hit",
      registered: true,
    },
  ],
};

const options = { manifest, currentProtocolHash: "protocol-hash", currentCorpusVersion: "corpus-hash" };

function record(overrides: Partial<RunValidationRecord> = {}): RunValidationRecord {
  return {
    runId: "run-1",
    variantId: "H1-48",
    arm: "jev",
    corpusVersion: "corpus-hash",
    protocolHash: "protocol-hash",
    implementationCommit: "abc123",
    diagnostics: {},
    ...overrides,
  };
}

test("accepts a complete registered run set", () => {
  assert.deepEqual(validateRunRecords([record(), record({ runId: "run-2" })], options), []);
});

test("rejects duplicate run IDs", () => {
  const errors = validateRunRecords([record(), record()], options);
  assert.ok(errors.some((error) => /duplicate runId/.test(error)));
});

test("rejects mixed corpus versions", () => {
  const errors = validateRunRecords([record(), record({ runId: "run-2", corpusVersion: "other" })], options);
  assert.ok(errors.some((error) => /mixed corpus version/.test(error)));
});

test("rejects unregistered arms and variants", () => {
  const errors = validateRunRecords(
    [record({ arm: "morph", variantId: "H9-999" })],
    options,
  );
  assert.ok(errors.some((error) => /unregistered arm/.test(error)));
  assert.ok(errors.some((error) => /unregistered variant/.test(error)));
});

test("rejects mixed implementation commits", () => {
  const errors = validateRunRecords(
    [record(), record({ runId: "run-2", implementationCommit: "def456" })],
    options,
  );
  assert.ok(errors.some((error) => /mixed implementation commits/.test(error)));
});

test("rejects missing stage diagnostics and protocol drift", () => {
  const errors = validateRunRecords([record({ diagnostics: undefined })], {
    ...options,
    currentProtocolHash: "changed",
  });
  assert.ok(errors.some((error) => /missing stage diagnostics/.test(error)));
  assert.ok(errors.some((error) => /protocol hash does not match/.test(error)));
});
