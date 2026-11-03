# OpenCode Fast Context

An exploration of fast, task-directed codebase retrieval for [OpenCode](https://opencode.ai/). The project is at the specification stage. It has no working plugin yet.

## Why explore this

Windsurf's Fast Context uses a specialized retrieval subagent to find relevant code before the main agent starts editing. Cognition reports that code search consumed more than 60% of the first turn in observed Windsurf and Devin sessions. Its published speed comparisons are product demonstrations, not an independent benchmark. See [Cognition's technical post](https://cognition.com/blog/swe-grep).

OpenCode already has code search plugins, including [OpenCodeRAG](https://github.com/MrDoe/OpenCodeRAG) and [OpenCode Indexer](https://github.com/jbpraxxys/opencode-indexer). This project will measure whether a focused retrieval tool finds useful code faster without losing relevant files.

## Proposed first experiment

First, measure DeepSeek's normal OpenCode search on reviewed code-location tasks. Then build an explicit retrieval tool that searches locally, asks Jev or Clef to rank the same bounded candidate set, and returns checked file and line citations. Start without a persistent index or a custom model.

Compare total search time, relevant-file recall, and context usage against the stock DeepSeek baseline. Morph is excluded. Record first-process and reused-process runs separately.

## Project status

OpenSpec is installed for OpenCode and Codex. Two changes define the work in order: [benchmark DeepSeek search](openspec/changes/benchmark-deepseek-search/proposal.md), then [add decision-guided retrieval](openspec/changes/add-decision-guided-retrieval/proposal.md). The latter includes Jev and Clef as separate options. No benchmark or plugin has run yet.
