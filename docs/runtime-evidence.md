# Runtime contract evidence

Captured 2026-11-04 with OpenCode `v2.2.5` and the release-candidate checkout.

The runtime smoke starts OpenCode with an isolated HOME, the local plugin path, and a local fake OpenAI-compatible transport. The captured model request is checked for the effective tool definition and session guidance. No Jev request is made.

| Item | Observed | SHA-256 |
| --- | --- | --- |
| Tool name | `fast_context_search` | |
| Description | defined in `src/tool.ts` | `19a0c9dae122ab4662b480ca1ff71864db62e8078e481e75203ed5e3aa1da508` |
| Input schema | `query` required; `maxFiles` optional integer 1-20; extra properties rejected | `7b1e14f4c34b7facc91df619723b37841499d41545a8b2d0645aaf90736f7d7a` |
| `autoInvoke: suggest` | guidance appears once; no provider call before the tool call | `997036a20eedecb8fd95ea18e7ee76c4c6b941ccfc55ef8d5ab43b72faac195d` |
| `autoInvoke: off` | tool remains registered; guidance absent | |

Commands:

```bash
node scripts/smoke-contract-runtime.mjs
node scripts/smoke-runtime.mjs
```

## Prompt comparison

`bench/locator-compare.ts` ran the legacy and locator Jev prompts against fixed labels in `bench/locator/fixtures`. The tuning split had five tasks and the acceptance split had two paraphrases added after the prompt choice. Legacy and locator both returned mean precision 0.28 and recall@5 0.80 on tuning, and mean precision 0.29 and recall@5 1.00 on acceptance. Raw traces are in `bench/locator/runs/results.json`. The fixture is synthetic and small; this is not held-out evidence and supports no general performance claim. No discovery scoring or selection threshold changed.
