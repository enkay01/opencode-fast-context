# Agent setup: Fast Context

To install this checkout as an OpenCode 2 plugin, run from the repository root:

```bash
npm ci && npm run verify:release && npm run setup:opencode -- --scope project
```

Stop if `TYPESAFE_API_KEY` is absent. Ask the user to provision it through their secret manager.
Never request the value in chat, print it, or write it to a file, `.env`, configuration, or a
command argument. The setup script only checks that the variable exists.

After setup, report the plugin ID (`fast-context`), the scope, and how to remove it. Do not tag,
publish, or install globally without explicit approval.
