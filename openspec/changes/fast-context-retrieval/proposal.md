# Proposal

## Why

Code generation models in OpenCode spend multiple turns and thousands of context tokens running sequential searches to locate relevant code. A dedicated retrieval subagent using fast decision models (Jev and Clef) can pinpoint exact files and line ranges in a bounded loop, saving main-agent context tokens and round-trips without requiring paid proprietary services.

## What Changes

- Add a fast retrieval engine running a bounded loop (up to 4 turns, up to 8 parallel tool calls) over local grep, glob, and read tools.
- Implement candidate selection and branch routing using TypeSafe System One decision primitives (Choice, Noul, Score) on Jev and Clef.
- Expose the engine as an OpenCode plugin tool (fast_context.search) that returns structured file paths and line ranges.
- Render compact citations and clean exploration status in the OpenCode interface so the main agent receives precise locations without search transcript noise.
- Provide a benchmark harness that measures latency, Precision@5, and context token savings against default DeepSeek search in OpenCode.

## Capabilities

### New Capabilities
- retrieval-engine: Bounded exploration loop executing parallel file operations guided by Jev and Clef decision primitives.
- plugin-interface: OpenCode tool integration, search status reporting, and citation formatting for the main agent context.
- retrieval-benchmark: Test harness comparing Jev and Clef retrieval speed and precision against OpenCode default DeepSeek search.

### Modified Capabilities
None.

## Impact

- Adds an OpenCode plugin codebase using TypeScript and the OpenCode plugin API.
- Adds client integration for TypeSafe AI (Jev) and Cloudflare Workers AI (Clef).
- Requires local shell access to ripgrep and standard file tools for low-latency searches.
