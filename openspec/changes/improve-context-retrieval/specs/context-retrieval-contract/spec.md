## ADDED Requirements

### Requirement: Retrieval contract
The harness SHALL describe fast_context_search as selecting relevant repository files and bounded excerpts for agent context. The registered description, schema descriptions, auto-invocation guidance, and ranker instructions SHALL agree with that purpose for code and readable documents.

#### Scenario: Agent receives the tool
- WHEN an isolated OpenCode session prepares its effective tool catalog
- THEN it exposes the canonical retrieval description and query/maxFiles input schema

### Requirement: Consumer-visible verification
A real supported OpenCode runtime check SHALL verify the effective tool contract and session guidance delivered to the consumer model. The check SHALL use synthetic source and fake provider/model transports.

#### Scenario: Guidance is disabled
- WHEN autoInvoke is off
- THEN the tool description and schema remain available and the additional invocation guidance is absent

### Requirement: Direct product guidance
The README setup/use path and harness guidance SHALL omit experimental and quality-parity warnings. Historical measurements SHALL remain accurate in benchmark documentation. Source-transmission and credential setup instructions SHALL remain available.

#### Scenario: User follows the README
- WHEN the user reads setup and usage instructions
- THEN they receive direct retrieval instructions without a benchmark-quality disclaimer

### Requirement: Status and absence semantics
The contract SHALL state that complete describes completion of retrieval, and no_match describes selection in that search. For status or absence tasks, agent guidance SHALL direct the caller to inspect current filesystem or version-control evidence as appropriate.

#### Scenario: No change document is retrieved
- WHEN retrieval selects no relevant change document
- THEN the caller guidance requires checking the relevant directory before claiming the document is absent

