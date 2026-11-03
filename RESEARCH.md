# Fast context research and decision

## What is published

Cognition says Windsurf Fast Context uses SWE-grep and SWE-grep-mini, models trained for code retrieval. The retrieval agent can run up to eight `grep`, `glob`, and `read` calls at once per turn, for at most four turns. It returns file paths and line ranges for the main coding agent. Cognition also reports indexing, multithreaded tools, a restricted tool set, and retrieval-specific training. Its comparison with Claude Code is a product demonstration, which Cognition says is not a rigorous benchmark. [Source](https://cognition.com/blog/swe-grep)

Devin Desktop advertises instant codebase context, but its public page does not say whether it uses the same model and deployment as Windsurf. [Source](https://devin.ai/desktop)

## Alternatives to test first

- [Morph's OpenCode plugin](https://github.com/morphllm/opencode-morph-plugin) supplies hosted WarpGrep search and requires a Morph API key.
- [open-codebase-index](https://github.com/Helweg/open-codebase-index) supplies local semantic and keyword retrieval, symbols, and a call graph.
- [OpenCodeRAG](https://github.com/MrDoe/OpenCodeRAG) supplies local embedding-based and hybrid code search.
- [OpenCode's built-in tools](https://docs.opencode.ai/docs/tools/) provide the zero-install baseline.

Microsoft's [FastContext paper](https://arxiv.org/abs/2606.14066) also studies a dedicated repository explorer with parallel search and compact evidence. Its results do not measure this project.

## Decision

Build a small prototype only if an on-demand retrieval agent has a credible path to lower wall-clock search time while finding the correct files as often as the existing options. A custom trained retrieval model is outside the initial scope. Benchmark real tasks on small and large repositories before adding an index.

The exact internal indexing and routing of Windsurf and Devin Desktop are not public. The proposed architecture is an inference from Cognition's published description, not a reproduction of its implementation.
