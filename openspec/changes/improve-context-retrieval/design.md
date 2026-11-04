# Design

## Source inspection

`src/index.ts` already registers TOOL_DESCRIPTION and TOOL_INPUT_SCHEMA through `ctx.tool.transform`. It also registers the session context guidance when autoInvoke is enabled. Harness-level documentation therefore exists in source. The remaining question is whether the running session exposes the intended contract to its model, not whether README or repository AGENTS.md is automatically loaded for plugin consumers.

`src/tool.ts` currently says files and ranges "answer a code question". `src/guidance.ts` uses "answered the question". `src/providers/types.ts` asks Jev for direct evidence answering a question and emphasizes implementation behavior. Those descriptions need to agree with the retrieval task, including prose design records.

## Triage and priorities

### P0: Product wording and agent contract

Remove the README's experimental banner and quality-parity warning from setup/use guidance. Use a direct opening: "Fast Context pulls relevant repository files and excerpts into your OpenCode agent's context." Keep the source-transmission disclosure and credential instructions because users need them to configure the plugin. Keep the benchmark record accurate in BENCHMARK.md, with one link from the README. Do not inject benchmark caveats into the harness or tool response.

Use one canonical description/schema/guidance module shared by registration and a generated `docs/agent-contract.md`. The document is for inspection; the registered tool and session context hook are how the consumer agent receives the contract. CI fails if the generated document drifts.

Proposed harness description:

> Retrieve relevant repository files and line ranges into context for the current task. Use a focused query with domain names, symbols, or behavior; results contain ranked paths and bounded excerpts. Read the selected ranges when more context is needed. For current project status or a missing artifact, also inspect the relevant directories and version-control state. On no_match or fallback_required, continue with ordinary search.

The query schema describes "The task, concepts, or identifiers whose relevant files should be retrieved." `maxFiles` is an upper bound, not a target count. Preserve min/max validation. Auto-invocation suggests retrieval for finding unknown files and skips redundant calls when a file is already supplied. It must not describe the tool as completing the user's task.

### P0: Verify what the harness delivers

Extend the existing real runtime smoke. Launch supported OpenCode 2 in an isolated config, inspect the session's effective tool definitions using its supported API or a captured mock model request, and assert the exact description, query/maxFiles JSON Schema, and guidance. A successful plugin import alone is insufficient. Use a fake model/provider transport and a synthetic repository; no production credential or provider quota is needed.

Verify autoInvoke off still exposes the tool description and schema while omitting only the extra guidance. Verify suggest inserts that guidance once. Store sanitized contract evidence with runtime version in the check output; do not capture an ambient user session.

### P1: Fewer distractors, including document retrieval

Build a synthetic, distributable regression repository representing the report: a design record, rules/specification document, visual brief, tangential HTML exploration, and generic application entrypoint. Include code-location cases so a docs improvement cannot silently degrade code retrieval. Label relevant files before changing prompts or thresholds.

Trace discovery admission, Jev decisions, and final selection. Determine whether the distractors come from lexical admission, question wording, ranker instructions, or result filling. Adjust the smallest supported cause. Relevance means material useful to the stated task, not merely shared vocabulary. A design document can be relevant without implementing code. Do not hard-code a preference for Markdown or a penalty for HTML/App.tsx based on this session.

Permit fewer than maxFiles results when remaining candidates are weak. Do not tune a new score threshold solely on the reported query. Compare the existing policy with the candidate on a fixed mixed-document set; report precision among returned files, recall@5, returned count, and latency. Keep unseen paraphrases for acceptance and preserve absent-query cases.

### P1: Caller workflow for planning and absence

Document an agent workflow: retrieve existing material; read useful ranges; when asked what remains, inspect current git state and the relevant OpenSpec/change/export directories; assemble the plan from those observations. Missing retrieval results do not establish that a file or change is absent. `complete` means the retrieval operation completed, not that context or project work is complete. `no_match` means no relevant evidence was selected in this search.

Encrypted .pen contents remain outside the readable corpus. Filename-only exports can be listed by normal filesystem tools; the plugin must not claim their contents were inspected. These are specific evidence boundaries, not generic uncertainty language. Do not make the plugin shell out to git status or list OpenSpec for every retrieval call.

## Acceptance

The runtime captures prove the consumer model receives the contract. Mixed-document regression labels prove useful design files survive and distractors can be omitted; an all-empty result cannot pass a precision check. Current code-location tests and security checks must remain green. README setup/use and agent instructions contain no experimental/quality-parity warning, and introduce no unsupported performance claim.

## Delivery sequence

Implement P0 wording and runtime contract verification first. Implement P1 caller guidance and the regression corpus next, then change ranking only after stage traces identify a cause. Submit implementation to Code Review Partner against this proposal before a new tag or local installation update. Keep distribution on GitHub.

