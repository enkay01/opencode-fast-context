# Design

## Context

See proposal.md - Why.

The user wants fast codebase localization in OpenCode without paid external services like Morph. The user has access to Jev and Clef, two System One decision models, and wants to benchmark them against the default search behavior of DeepSeek models in OpenCode.

## Goals / Non-Goals

**Goals:**
- Provide a lean OpenCode plugin implementing a fast retrieval subagent.
- Use Jev and Clef decision primitives (Choice, Noul, Score) to steer parallel search tool calls without autoregressive text generation.
- Keep tool latency minimal by fanning out ripgrep and file-read commands locally.
- Deliver precise file and line citations into the main agent context.
- Measure latency, token consumption, and precision against OpenCode default DeepSeek search.

**Non-Goals:**
- Paid hosted search services or Morph API integrations.
- Persistent background vector database daemons or full-repository embedding sweeps.
- Training custom foundation neural networks from scratch.

## Decisions

### 1. Decision models (Jev and Clef) instead of generative LLM chat loops
- **Rationale:** Generative chat models spend hundreds of milliseconds streaming reasoning tokens and JSON formatting. Jev and Clef evaluate candidate branches and file relevance in a single forward pass with calibrated confidence. This enables sub-second turn times in the exploration loop.
- **Alternatives considered:**
  - Running a local 7B generative model: higher memory footprint, slower token generation, and occasional tool-calling JSON parse errors.
  - Embeddings-only search: fast lookup, but struggles with cross-file dependency chasing and architectural paths.

### 2. Native ripgrep and glob execution for tool primitives
- **Rationale:** Local `rg` is SIMD-accelerated and instant. Launching up to 8 parallel searches per turn over local directories gives high coverage without maintaining a separate database index.
- **Alternatives considered:**
  - In-process JavaScript grep: significantly slower on repositories larger than 10,000 files.
  - SQLite trigram indexes: requires indexing step and sync watchers.

### 3. Compact citation interface
- **Rationale:** Returning structured `{ file, startLine, endLine, excerpt }` structures keeps the main agent context clean. The main agent can immediately read or edit the identified file spans rather than digesting hundreds of lines of search transcript.
- **Alternatives considered:**
  - Injecting full file contents: quickly blows out context limits and increases inference costs.
  - Free-form text summaries: loses line number precision.

### 4. Direct benchmark against OpenCode DeepSeek baseline
- **Rationale:** Tests the exact question the user cares about: does the Jev/Clef fast context subagent locate code faster and with fewer tokens than OpenCode's default DeepSeek model using native search tools?
- **Alternatives considered:**
  - Comparing against Morph: rejected by user constraint (no Morph subscription).
  - Synthetic retrieval metrics: lacks real-world editor workflow fidelity.

## Risks / Trade-offs

- [Decision model connectivity] -> Provide dual-provider support (hosted Jev and Cloudflare/local Clef) with automated fallback to OpenCode standard search.
- [Vocabulary mismatch in unfamiliar codebases] -> Use speculative keyword variations in turn 1 fan-out to maximize recall before pruning.
- [Timeout on massive repositories] -> Hard cap each turn at 1.5 seconds and entire search at 5 seconds.
