# OpenCode Fast Context

An exploration of fast, task-directed codebase retrieval for [OpenCode](https://opencode.ai/). The project is at the specification stage. It has no working plugin yet.

## Why explore this

Windsurf's Fast Context uses a specialized retrieval subagent to find relevant code before the main agent starts editing. Cognition reports that code search consumed more than 60% of the first turn in observed Windsurf and Devin sessions. Its published speed comparisons are product demonstrations, not an independent benchmark. See [Cognition's technical post](https://cognition.com/blog/swe-grep).

OpenCode already has code search plugins, including [OpenCodeRAG](https://github.com/MrDoe/OpenCodeRAG) and [OpenCode Indexer](https://github.com/jbpraxxys/opencode-indexer). This project should proceed only if a retrieval subagent proves faster at finding the right code on representative repositories, without reducing accuracy.

## Proposed first experiment

Build a small OpenCode plugin that sends a search task to a fast retrieval process. The process can use file paths, text search, and symbol references in parallel. It returns a short list of files and line ranges, with evidence for each result. Start without a persistent index or a custom model. Add either only if measurements justify it.

Measure wall-clock time, correct-file recall, and tokens given to the main agent against OpenCode's normal search and existing plugins. Test warm and cold repositories. Set target thresholds in an OpenSpec proposal before implementation.

## Project status

OpenSpec is installed for OpenCode and Codex. Start the first design change with `/opsx-propose` in OpenCode or `$openspec-propose` in Codex. No implementation has been committed.
