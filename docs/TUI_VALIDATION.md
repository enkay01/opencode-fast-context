# Fast Context TUI validation

Run these commands in the checkout you want to test after installing its npm dependencies. The harness builds a temporary copy of that checkout's source and drives the full OpenCode TUI over a pseudoterminal. It starts a standalone OpenCode server with its own temporary home, XDG config, data, state, and cache. It loads just the test plugin into a synthetic project that contains one source file. The checkout's `dist/` is untouched, including when the global install points at the same checkout.

## Run with fixture credentials

```sh
bash scripts/validate-tui.sh --mock
```

The harness enters fixture keys in the actual masked TUI prompt and checks direct Gemini onboarding, picker selection, cancellation, selection storage failures, and revocation. It verifies the sidebar and status dialog after 401, 403, 429, timeout, and status RPC failure. It checks that a second server and a restarted server read the persisted choice, and that the status RPC and tool report the same server instance. A loopback model calls the real `fast_context_search` tool. The fixture simulates provider responses and storage faults at their boundaries. The run prints the directory of SVG captures.

Use `bash scripts/validate-tui.sh --mock-env` to exercise Varlock injection and the same environment-key flow used by the live run, using fixture values in a temporary Varlock directory.

## Run with real credentials

1. Run `bash scripts/validate-tui.sh --init-keys`. It prints the path to `scripts/validation/.env.local` in the main checkout and creates a private, ignored file if it is missing.
2. Open that file in an editor and fill in `TYPESAFE_API_KEY` and `GEMINI_API_KEY`. You can also store Varlock's encrypted value expressions.
3. Run `bash scripts/validate-tui.sh --live`.

The launcher resolves the main checkout from Git's common directory. Every linked worktree containing the launcher uses the same key file and builds its own plugin code. Varlock loads the two keys into the private validation process. The hosted providers receive source-free credential checks and the synthetic fixture query and excerpt. The chat model stays on loopback. Each live run needs an installed OpenCode 2 with access to both provider APIs.

Run `bash scripts/gemini-self-test-wizard.sh` to enter a Gemini key yourself in the masked OpenCode prompt. The wizard checks for an active, verified Gemini connection and calls the real search tool against the synthetic fixture. It compares the server instance from status with the one in tool metadata before reporting success. The OpenCode profile is disposable.

Screenshots stay under `.validation-output/` in the checkout that ran the test. The harness captures frames after onboarding or before opening a key prompt. It checks for the real key values in each frame before writing. On macOS with Swift installed, it also renders the SVG frames as PNGs. Review any frame before attaching it to a PR.
