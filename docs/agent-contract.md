# Agent contract

Generated from the registered plugin definitions. Do not edit by hand.

## Tool

`fast_context_search`

Retrieve relevant repository files and line ranges into context for the current task. Use a focused query with domain names, symbols, or behavior; results contain ranked paths and bounded excerpts. Read the selected ranges when more context is needed. For current project status or a missing artifact, also inspect the relevant directories and version-control state. On no_match or fallback_required, continue with ordinary search.

## Input schema

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "query"
  ],
  "properties": {
    "query": {
      "type": "string",
      "minLength": 2,
      "description": "The task, concepts, or identifiers whose relevant repository files should be retrieved. Natural-language behavior queries are supported; naming the target file is not required."
    },
    "maxFiles": {
      "type": "integer",
      "minimum": 1,
      "maximum": 20,
      "description": "Maximum number of files to return. This is a ceiling; fewer files may be returned. Defaults to the configured limit."
    }
  }
}
```

## Session guidance (autoInvoke: suggest)

For repository tasks that need locating relevant files across unknown directories, call `fast_context_search` before broad iterative search. Use a focused query with known domain names, symbols, or behavior; name the target file only if you already know it. Do not call it when you have supplied the file or need a direct known-file read. If it returns `no_match` or `fallback_required`, continue with ordinary search. For current status or a missing artifact, also inspect the relevant directories and version-control state.
