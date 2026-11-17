# Security

## Reporting

Report suspected vulnerabilities privately through GitHub Security Advisories on
`enkay01/opencode-fast-context`. Do not open a public issue for a credential leak or
provider-boundary bypass.

## Credential handling

- The selected provider accepts `TYPESAFE_API_KEY` or `GEMINI_API_KEY` from the OpenCode server process environment, or its separate OpenCode integration credential store entry.
- The plugin never accepts the key through options, command arguments, or configuration files,
  and never writes or prints it.
- Provider errors expose only the provider, HTTP status, and a safe request identifier. Response
  bodies and request data are discarded.

## Source transmission

When `fast_context_search` runs, the query and up to 24 bounded source excerpts are sent to the selected service: TypeSafe System One or Google Gemini Decisions over HTTPS. The plugin excludes environment files, credential
files, cloud configuration, service-account files, Terraform variables, private keys, and
symlinks outside the worktree. It rejects private-key blocks and redacts common token forms.

These filters reduce risk but cannot prove that arbitrary source contains no confidential
material. For repositories that must remain local, set `autoInvoke: "off"`, do not call the tool,
or remove the plugin.

Google's [Gemini API terms](https://aistudio.google.com/docs/terms) allow free-tier inputs to be used for product improvement and human review. Do not send confidential code on that tier. Billing-enabled API projects have different data-use terms, including limited abuse-monitoring logs. The masked Gemini prompt links the terms before a key is stored.

## Scope

This policy covers the published package and the setup scripts in this repository. It does not
cover TypeSafe, OpenCode, or the model provider.
