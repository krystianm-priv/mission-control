# SOURCEMAP.md

## Root

### `README.md`

- the public product README
- must describe the repo honestly
- must not claim that v1 is already complete unless that is actually true
- should describe the adapter-oriented architecture, not an outdated hardcoded package story

### `ROADMAP.md`

- the real source of truth for v1
- defines what is still missing
- overrides older assumptions and optimistic legacy wording

### `AGENTS.md`

- operating manual for agents
- roadmap-first
- forces agents to treat the current repo as pre-v1

### `package.json`

- root workspace config
- currently includes the real workspace roots that exist today
- includes:
  - `core`
  - `adapters/*`
  - `examples/*`
  - any additional app workspace only if it is genuinely in scope

## Primary package / workspace boundaries

## `core`

Purpose:

- mission / workflow definition DSL
- shared mission and runtime contracts
- input validation helpers
- retry and timer primitives
- shared execution engine
- abstract commander / runtime contracts
- durable adapter-facing persistence contracts

Rules:

- must stay runtime-neutral
- must not contain SQLite-specific or Postgres-specific code
- must not become coupled to ORMs, queues, or framework integrations

Typical files of interest:

- mission definition builder
- runtime engine
- contracts and types
- retry / timer helpers
- commander abstractions
- adapter contract types and persistence contract helpers

## `adapters/in-memory`

Purpose:

- explicit in-memory runtime
- local testing and examples
- deterministic behavior for engine validation

Rules:

- should stay thin relative to the shared engine
- should not become hidden global state
- should not absorb durable-backend concerns

Typical files of interest:

- in-memory commander wrapper
- fake clock / testing fixtures
- in-memory runtime tests

### `adapters/*`

Purpose:

- durable backend implementations
- backend-specific schema / storage / serialization / recovery details
- first-class package boundary for persistence backends

Naming rule:

- durable adapter packages should be named like:
  - `@mission-control/adapter-sqlite`
  - `@mission-control/adapter-postgres`

### `adapters/sqlite`

Intended role:

- SQLite durable adapter package
- package name: `@mission-control/adapter-sqlite`
- currently not the reference v1 backend

Typical responsibilities:

- schema / migrations
- SQLite storage format
- inspection serialization
- backend bootstrap
- durable load / save / recovery mechanics
- adapter-specific tests

### `adapters/postgres`

Intended role:

- Postgres durable adapter package
- package name: `@mission-control/adapter-postgres`
- current reference v1 backend

Typical responsibilities:

- schema / migrations
- SQL execution boundary
- inspection serialization
- backend bootstrap
- durable load / save / recovery mechanics
- adapter-specific tests

## Examples

### `examples/ask-user-for-review`

- small in-memory mission example
- useful for local engine semantics
- should not imply durable guarantees

### `examples/order-fulfillment`

- in-memory multi-step mission example
- useful for waits / signals / sequencing
- should not overclaim production workflow guarantees

### `examples/durable-reminder`

- durable adapter example
- uses the current v1 reference adapter: `@mission-control/adapter-postgres`
- useful for reload / timer / retry examples

## Conceptual architecture

Mission Control should be understood as:

1. `core`
   - the DSL
   - the engine
   - the contracts
2. `adapters/in-memory`
   - the local / ephemeral runtime adapter
3. `adapters/*`
   - runtime adapters, including durable persistence backends

The durable backend is an implementation detail of the adapter boundary, not of `core`.

## What agents should treat as unstable

The following may change as part of reaching v1:

- which durable adapter becomes the first production-grade reference backend
- examples that still reference outdated packages
- release scripts that still point at the old package graph
- docs that still speak as if v1 is already complete

## What agents should treat as stable

These are the intended long-term architectural anchors:

- `core` remains runtime-neutral
- in-memory runtime stays explicit
- runtime adapters live under `adapters/*`
- durable backend package names use `@mission-control/adapter-*`
- v1 must be honest about guarantees and limits
- snapshot persistence alone is not sufficient to claim exactly-once side-effect execution

## Out of scope for v1

Unless the roadmap explicitly changes:

- workflow versioning for already-running missions
- visual builders
- browser-first runtimes
- Temporal / DBOS compatibility layers
- multi-cluster orchestration
- a large matrix of production-ready durable adapters
