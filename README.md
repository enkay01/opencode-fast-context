# OpenCode Fast Context

Fast Context pulls relevant repository files and excerpts into your OpenCode agent's context. It uses bounded local search, ranks candidates with Jev, and returns paths with line ranges for the caller to read. The tool locates material; it does not answer the question itself.

## What it does

A model calls:

```json
{ "query": "retry backoff attempt jitter", "maxFiles": 5 }
```

The plugin:

1. tokenizes the query, stems code terms, expands common synonyms, and groups concepts;
2. searches locally with ripgrep, weighting rare terms and down-weighting docs, translations, and tests;
3. keeps one to three promising ranges per file;
4. sends up to 24 candidate snippets to Jev for relevance scoring, one question per file;
5. re-reads selected evidence, validates line ranges and digests, and returns `path:line` citations.

The result describes what was searched: candidate windows passed into relevance scoring, distinct files among them, and whether discovery hit its deadline. `complete` means retrieval completed. `no_match` means this search selected no relevant evidence; it is not proof that the project lacks the material. For current status or a missing artifact, the caller should also inspect the relevant directories and version-control state. Encrypted artifact contents need a suitable reader.

It does not build an index, write to the repository, run a background process, or intercept built-in search tools.

## Requirements

- OpenCode 2 (`>=2.2.0 <3`); tested with 2.2.5.
- Node 22.18 or newer for local setup and development.
- `ripgrep` (`rg`) on `PATH`.
- A TypeSafe API key, supplied either through `TYPESAFE_API_KEY` or through OpenCode's credential store (see [Credential](#credential)).

## Install

### From GitHub (recommended)

```bash
opencode plugin add github:enkay01/opencode-fast-context#v0.2.1
opencode plugin list
```

This installs the tagged release. npm publication is intentionally not used for V1.

### From a local checkout

```bash
git clone --branch v0.2.1 https://github.com/enkay01/opencode-fast-context
cd opencode-fast-context
npm ci
npm run verify:release
npm run setup:opencode -- --scope global
```

`setup:opencode` adds the absolute checkout path to the global OpenCode configuration, preserves existing plugins, verifies the plugin ID, and prints the removal command. Re-running it is a no-op. Use `--scope project` for a project-local install. A TypeSafe key is not required at setup time: the plugin prompts for it in the OpenCode TUI on the first interactive search.

### One-shot instruction for an agent

The root [AGENTS.md](AGENTS.md) tells an assigned agent to run:

```bash
npm ci && npm run verify:release && npm run setup:opencode -- --scope project
```

The agent must never request the key value in chat or write it to a file. If `TYPESAFE_API_KEY` is absent, the plugin prompts for the key inside the OpenCode TUI on the first search instead.

## Credential

Fast Context resolves the TypeSafe key in this order:

1. `TYPESAFE_API_KEY` in the environment of the OpenCode server process;
2. the OpenCode integration credential store under the `fast-context` integration;
3. an interactive masked prompt in the OpenCode TUI when a search runs without either.

To use the environment variable, start OpenCode from a shell or service where your secret manager has exported it:

```bash
# Example only; do not commit this line.
export TYPESAFE_API_KEY="$(your-secret-manager read typesafe)"
opencode
```

The environment key always wins. A stored credential is only consulted when no environment key exists, and a rejected environment key never deletes or replaces a stored one.

### Interactive onboarding

When an interactive OpenCode session runs `fast_context_search` with no usable key, the plugin emits a TUI prompt. The input is masked, the key is verified live against TypeSafe before anything is stored, and a rejected key shows an inline error without being saved. Dismissing the prompt returns `fallback_required` and the search continues with ordinary tools.

A stored key that TypeSafe later rejects (HTTP 401 or 403) is treated as expired: the stale record is removed before the replacement prompt appears on the next search. If no interactive client can prompt, the record is removed when one next attaches and the search returns `fallback_required`.

The key is persisted only through OpenCode's native integration credential store (SQLite under the OpenCode data directory). It is never written to `opencode.json`, `opencode.jsonc`, plugin options, command arguments, `.env` files, repository files, or logs.

### Lifecycle commands

In the OpenCode TUI:

- `/fast-context auth` stores or replaces the key through the same masked, verified prompt;
- `/fast-context auth status` shows which credential sources are configured, without exposing values;
- `/fast-context auth revoke` removes every Fast Context record from the credential store after confirmation. `TYPESAFE_API_KEY` is not affected.

Headless runs (`opencode run`, background jobs, subagents, or sessions the TUI is not showing) never block on a prompt. They return `fallback_required` immediately when no credential resolves. A rejected stored key is removed when an interactive client next attaches.

## Configuration

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["opencode-fast-context@0.2.1"]
}
```

To set an option, use the object form:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    { "package": "opencode-fast-context@0.2.1", "options": { "autoInvoke": "off" } }
  ]
}
```

Optional plugin options:

| Option | Values | Default | Meaning |
| --- | --- | --- | --- |
| `autoInvoke` | `"suggest"` or `"off"` | `"suggest"` | Adds one session instruction telling the model when to call `fast_context_search`. |

`suggest` adds this guidance to model context:

> For repository questions that require locating behavior across unknown files, call `fast_context_search` before broad iterative search. Do not call it when the user supplied the file, for a direct known-file read, or after it has already answered the question. If it returns `no_match` or `fallback_required`, continue with ordinary search.

This is **automatic tool selection guidance**, not hidden execution. The plugin does not inspect prompts, run retrieval, or contact Jev until the model makes a visible `fast_context_search` tool call. The model can still decline. Set `"off"` to add no instruction.

## Data sent to TypeSafe

When the tool runs, the query and up to 24 bounded source excerpts are sent over HTTPS to TypeSafe's System One endpoint. Provider credentials and request headers are not included in tool output or errors.

Before sending, the plugin:

- excludes `.env*`, package-manager credentials, Git credentials, cloud configuration, service-account files, Terraform variable files, private keys, and symlinks outside the worktree;
- rejects private-key and certificate blocks;
- redacts common API-key, bearer-token, cloud-key, and JWT patterns.

Redaction is defence in depth, not a guarantee that arbitrary source contains no confidential material. For repositories that must stay local, set `autoInvoke: "off"` and do not call the tool, or remove the plugin.

## Results

The tool returns one of:

- `complete`: retrieval completed with checked citations and short excerpts;
- `no_match`: no relevant evidence was selected in the searched scope;
- `fallback_required`: Jev is unavailable or misconfigured; continue with ordinary search.

Intermediate grep output and provider exchanges stay out of the conversation.

## Remove

```bash
npm run setup:opencode -- --remove --scope global
```

Use `--scope project` if it was installed locally. Restart OpenCode after changing configuration.

## Troubleshooting

- **Tool missing after install**: restart the background service with `opencode service restart`, then start a new session. Existing sessions keep their old tool catalog. `opencode plugin list` does not show local-path plugins; use `opencode api GET /api/plugin` instead.
- **Key works in a terminal but not the app**: the `opencode` shell wrapper only affects processes launched from that shell. The background service and a Dock-launched app do not inherit it. Restart the service from the wrapped shell, or launch OpenCode from that terminal.
- **`TYPESAFE_API_KEY is not set`**: export the key in the environment that launches OpenCode, or run `/fast-context auth` in the TUI to store one. Do not add it to configuration.
- **Prompt never appears**: the TUI part of the plugin must be loaded. Check `opencode plugin list`, restart the TUI, and confirm the session is interactive. Headless runs intentionally skip the prompt.
- **Frequent `fallback_required`**: check provider status and the configured model. Ordinary search is unaffected.
- **`no_match` on a real target**: the searched candidate pool did not contain a passing match. Try more specific identifiers or inspect the relevant directories.
- **No guidance added**: check that `autoInvoke` is not `"off"` and that your OpenCode version supports session context hooks.

## Benchmark

Development measurements on a small corpus: median latency was about 89% lower than stock OpenCode with DeepSeek on six tuning tasks (4.8s versus 44.2s), and 73% lower on four validation tasks (5.1s versus 18.6s). Recall@5 on the validation tasks was 0.50 against 1.00 for stock search. Each figure is one run per task on that corpus. Method, sample sizes, and limits are in [BENCHMARK.md](BENCHMARK.md).

## Development

```bash
npm test                  # unit and integration tests
npm run test:corpus       # pinned corpus check (requires bench/repos)
npm run typecheck
npm run verify:release    # typecheck, tests, build, API and runtime contract smoke, package and secret checks
npm run build
```

Release verification does not publish, tag, or install anything. The generated agent contract is in [docs/agent-contract.md](docs/agent-contract.md); `npm run contract:check` detects drift. The benchmark requires local pinned checkouts; see [BENCHMARK.md](BENCHMARK.md).

## License

MIT. See [LICENSE](LICENSE).
