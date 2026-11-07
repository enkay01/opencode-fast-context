# Agent setup: Fast Context

To install this checkout as an OpenCode 2 plugin, run from the repository root:

```bash
npm ci && npm run verify:release && npm run setup:opencode -- --scope project
```

Never request the key value in chat, print it, or write it to a file, `.env`, configuration, or a
command argument. If `TYPESAFE_API_KEY` is absent, the plugin prompts for the key inside the
OpenCode TUI on the first search; no agent action is needed.

After setup, report the plugin ID (`fast-context`), the scope, and how to remove it. Do not tag,
publish, or install globally without explicit approval.
