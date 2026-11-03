# Tasks

## 1. Setup & Provider Clients

- [ ] 1.1 Scaffold TypeScript plugin project with build and test scripts, verifying `npm test` runs cleanly
- [ ] 1.2 Implement decision client adapter supporting TypeSafe Jev and Cloudflare Clef with unified Choice, Noul, and Score interfaces, verifying unit tests with mocked responses pass

## 2. Fast Retrieval Engine

- [ ] 2.1 Implement parallel local search tools executing ripgrep and file-read operations with 8-way fan-out limits, verifying execution benchmarks on a sample directory
- [ ] 2.2 Implement bounded multi-turn exploration controller capping execution at 4 turns and 5s timeout, verifying termination tests pass
- [ ] 2.3 Integrate Jev and Clef decision primitives into candidate evaluation and next-step selection, verifying pruning of test files and irrelevant directories

## 3. OpenCode Plugin & Interface

- [ ] 3.1 Implement OpenCode tool handler registering `fast_context.search`, verifying parameter validation and tool exposure
- [ ] 3.2 Implement non-intrusive status reporting and compact citation formatting (`file:start-end`), verifying formatted output meets character budget
- [ ] 3.3 Implement automatic fallback to OpenCode standard search on decision model failure or timeout, verifying error recovery test cases

## 4. Benchmark Suite & Evaluation

- [ ] 4.1 Build evaluation test harness with 10 representative codebase navigation tasks and known ground-truth locations
- [ ] 4.2 Implement baseline runner executing OpenCode default DeepSeek search across the benchmark tasks, verifying output capture
- [ ] 4.3 Run comparative evaluation across Jev, Clef, and DeepSeek baseline, generating a Markdown report of latency, Precision@5, and context token consumption
