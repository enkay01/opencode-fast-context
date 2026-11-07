# OpenCode database credential storage

Checked 7 November 2026 against the v2.2.5 source tag and installed OpenCode v2.2.5. Research only; no production plugin or proposal changes.

## Finding

Yes. A server plugin can use OpenCode's database through supported APIs. Direct SQL writes are unnecessary. There are two distinct routes.

### Integration credential store (recommended)

Register a dedicated integration with a key authentication method using `ctx.integration.transform` and `editor.method.update`. Save the validated token with `ctx.integration.connect.key({ integrationID, key })`. Retrieve its selected connection with `ctx.integration.connection.active(integrationID)`, then resolve it with `ctx.integration.connection.resolve(connection)`.

This works for a non-model service: OpenCode's own Exa websearch plugin registers key/environment authentication and resolves its active credential this way. Fast Context can use a dedicated integration ID; it does not have to invent a model provider.

Sources: [v2.2.5 integration plugin types](https://github.com/anomalyco/opencode/blob/v2.2.5/packages/plugin/src/promise/integration.ts), [host implementation](https://github.com/anomalyco/opencode/blob/v2.2.5/packages/core/src/plugin/host.ts), [Exa plugin](https://github.com/anomalyco/opencode/blob/v2.2.5/packages/core/src/plugin/websearch/exa.ts).

The server API includes credential create/list/remove/activate. Its update operation changes the label only. The server plugin context exposes only `credential.activate`, alongside integration connect/resolve operations; do not assume `ctx.credential.create` or `ctx.credential.remove` exists. Revocation needs a client API path, such as the TUI client, or another verified bridge. Repeated `connect.key` calls create additional records, so replacement must define what happens to the old credential.

Sources: [credential protocol](https://github.com/anomalyco/opencode/blob/v2.2.5/packages/protocol/src/groups/credential.ts), [plugin context](https://github.com/anomalyco/opencode/blob/v2.2.5/packages/plugin/src/promise/plugin.ts), [credential handlers](https://github.com/anomalyco/opencode/blob/v2.2.5/packages/server/src/handlers/credential.ts).

### Plugin storage (also possible)

`ctx.storage.get/set/remove` stores JSON in OpenCode's SQLite `kv` table. The host prefixes entries with the plugin ID. The backing KV service is global, rather than tied to a project directory. This route is simpler for private plugin state but does not register a managed integration credential.

Sources: [storage interface](https://github.com/anomalyco/opencode/blob/v2.2.5/packages/plugin/src/promise/storage.ts), [namespace implementation](https://github.com/anomalyco/opencode/blob/v2.2.5/packages/core/src/plugin/host.ts#L688), [KV service](https://github.com/anomalyco/opencode/blob/v2.2.5/packages/core/src/kv.ts), [KV schema](https://github.com/anomalyco/opencode/blob/v2.2.5/packages/core/src/kv/sql.ts).

## Protection and location

Both routes store JSON values without application-level encryption. Database code creates/chmods the database and sidecars to `0o600` on Unix and skips that operation on Windows. Using the database delegates filesystem handling to OpenCode; it does not add OS Keychain protection. The server owns the database, so a remote server keeps the credential on the server machine.

Sources: [credential SQL schema](https://github.com/anomalyco/opencode/blob/v2.2.5/packages/core/src/credential/sql.ts), [database implementation](https://github.com/anomalyco/opencode/blob/v2.2.5/packages/core/src/database/database.ts), [credential service](https://github.com/anomalyco/opencode/blob/v2.2.5/packages/core/src/credential.ts).

## Runtime checks

Used temporary HOME and XDG directories under `/private/tmp/fc-credential-research/runtime`, standalone servers, and dummy strings. No real token or user database was read or changed.

- A custom server plugin registered `fc-research`, connected a dummy key, resolved the active connection, and asserted the returned dummy value matched. This succeeded on two separate launches.
- The same plugin wrote a JSON counter through `ctx.storage`. SQLite contained its namespaced entry with `runs: 2` after the second launch.
- The credential table contained two records from the plugin's two connect calls, plus a separately created server-API dummy record.
- Removed all three dummy credentials through `credential.remove`; a fresh SQLite read confirmed zero matching records.
- The temporary database mode was `0o600` on this Mac.

The plugin launches used a deliberately invalid model to stop before an inference request; their final exit status was 1 as expected. The storage writes and connection assertions executed before that failure. Windows permissions, masked TUI entry, live TypeSafe validation, and expired-token recovery were not exercised.

## Recommendation

Use OpenCode's integration credential store for the saved Jev token, retain the explicit environment override, and keep endpoint validation and first-login/expired-token prompting in Fast Context. Revise the design to prove credential replacement and removal through the TUI/client boundary. No separate `credentials.json` or plugin-owned ACL implementation is needed for this storage route. Compatibility evidence here covers OpenCode 2.2.5.
