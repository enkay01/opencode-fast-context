import assert from "node:assert/strict";
import { test } from "node:test";
import { AUTO_INVOKE_GUIDANCE } from "../src/guidance.ts";
import { RELEVANCE_CRITERIA, RELEVANCE_INSTRUCTIONS } from "../src/providers/types.ts";
import { TOOL_DESCRIPTION, TOOL_INPUT_SCHEMA, formatForModel } from "../src/tool.ts";
import type { SearchResult } from "../src/types.ts";

test("tool description is a locator contract and states its limits", () => {
  assert.match(TOOL_DESCRIPTION, /Retrieve relevant repository files and line ranges/);
  assert.match(TOOL_DESCRIPTION, /no_match or fallback_required/);
  assert.match(TOOL_DESCRIPTION, /directories and version-control state/);
  assert.ok(!/\banswers?\b/i.test(TOOL_DESCRIPTION), "description must not claim to answer");
});

test("schema keeps query required, maxFiles a bounded ceiling, and rejects extras", () => {
  const schema = TOOL_INPUT_SCHEMA as unknown as {
    additionalProperties: boolean;
    required: string[];
    properties: Record<string, { description: string; minimum?: number; maximum?: number }>;
  };
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.required, ["query"]);
  assert.equal(schema.properties.maxFiles?.minimum, 1);
  assert.equal(schema.properties.maxFiles?.maximum, 20);
  assert.match(schema.properties.maxFiles?.description ?? "", /ceiling/i);
  assert.match(schema.properties.query?.description ?? "", /Natural-language/);
});

test("auto-invoke guidance routes to the tool without claiming it resolves the task", () => {
  assert.match(AUTO_INVOKE_GUIDANCE, /fast_context_search/);
  assert.match(AUTO_INVOKE_GUIDANCE, /no_match/);
  assert.match(AUTO_INVOKE_GUIDANCE, /version-control state/);
  assert.ok(!/\banswers?\b/i.test(AUTO_INVOKE_GUIDANCE));
});

test("Jev prompts ask for relevant context, not an answer", () => {
  assert.match(RELEVANCE_INSTRUCTIONS, /relevant context/);
  assert.ok(!/\banswers?\b/i.test(RELEVANCE_INSTRUCTIONS));
  assert.ok(!/\banswers?\b/i.test(RELEVANCE_CRITERIA.true));
  assert.ok(!/\banswers?\b/i.test(RELEVANCE_CRITERIA.false));
});

test("formatted output reports searched scope and does not claim global absence", () => {
  const result: SearchResult = {
    version: 1,
    query: "x",
    status: "no_match",
    results: [],
    truncated: true,
    candidateCount: 12,
    searched: { candidates: 12, files: 5, truncated: true },
    provider: { id: "jev", model: "test", usage: null },
    timings: { discovery: 10, ranking: 20, total: 30 },
  };
  const text = formatForModel(result);
  assert.match(text, /searched: 12 candidate windows across 5 files/);
  assert.match(text, /discovery truncated/);
  assert.match(text, /not proof that no matching file exists/);
});
