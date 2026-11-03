# Security

## Reporting

Report suspected vulnerabilities privately through GitHub Security Advisories on
`enkay01/opencode-fast-context`. Do not open a public issue for a credential leak or
provider-boundary bypass.

## Credential handling

- The only accepted credential is `TYPESAFE_API_KEY`, read from the OpenCode server process
  environment.
- The plugin never accepts the key through options, command arguments, or configuration files,
  and never writes or prints it.
- Provider errors expose only the provider, HTTP status, and a safe request identifier. Response
  bodies and request data are discarded.

## Source transmission

When `fast_context_search` runs, the query and up to 24 bounded source excerpts are sent to
TypeSafe's System One endpoint over HTTPS. The plugin excludes environment files, credential
files, cloud configuration, service-account files, Terraform variables, private keys, and
symlinks outside the worktree. It rejects private-key blocks and redacts common token forms.

These filters reduce risk but cannot prove that arbitrary source contains no confidential
material. For repositories that must remain local, set `autoInvoke: "off"`, do not call the tool,
or remove the plugin.

## Scope

This policy covers the published package and the setup scripts in this repository. It does not
cover TypeSafe, OpenCode, or the model provider.
