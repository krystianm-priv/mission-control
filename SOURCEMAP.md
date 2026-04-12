# SOURCEMAP.md

## Root

### `README.md`

- product README for the current v1 release candidate
- describes the three public packages and the `PgCommander` execute-boundary API

### `ROADMAP.md`

- release-bar task list for v1
- must match the real package and runtime story in the repo

### `AGENTS.md`

- agent operating manual for roadmap-first work

### `package.json`

- workspace scripts for build, typecheck, lint, test, and pack verification

## Packages

### `packages/core`

Purpose:

- typed mission DSL
- shared mission/runtime contracts
- validation helpers
- retry/timer metadata
- shared execution engine
- abstract `Commander` base class

Key files:

- `packages/core/src/mission-definition.ts`
- `packages/core/src/types.ts`
- `packages/core/src/schema.ts`
- `packages/core/src/contracts.ts`
- `packages/core/src/engine.ts`
- `packages/core/src/commander.ts`

### `packages/in-memory-commander`

Purpose:

- in-memory runtime implementation
- deterministic local semantics for tests and examples

Key files:

- `packages/in-memory-commander/src/in-memory/commander.ts`
- `packages/in-memory-commander/src/testing/fixtures.ts`
- `packages/in-memory-commander/src/in-memory/commander.test.ts`

### `packages/postgres-commander`

Purpose:

- durable Postgres runtime implementation for v1
- schema bootstrap and migrations
- persistence/reload/resume semantics
- integration boundary through `execute(query: string)`

Key files:

- `packages/postgres-commander/src/commander.ts`
- `packages/postgres-commander/src/store.ts`
- `packages/postgres-commander/src/schema.ts`
- `packages/postgres-commander/src/sql-executor.ts`
- `packages/postgres-commander/src/migrations/*`
- `packages/postgres-commander/src/*.test.ts`

Notes:

- durable tests use `@electric-sql/pglite` when it is installed locally
- the package itself does not depend on a specific Postgres client

## Examples

### `examples/ask-user-for-review`

- in-memory mission example

### `examples/order-fulfillment`

- in-memory sequential mission example

### `examples/durable-reminder`

- Postgres-backed durability example using `PgCommander`
- demonstrates the `execute(query)` API with PGlite

## Package boundaries

1. `core`: workflow DSL and shared runtime logic
2. `in-memory-commander`: ephemeral runtime implementation
3. `postgres-commander`: durable Postgres runtime for v1

## Out of scope for v1

- workflow versioning for already-running missions
- alternate durable backends
- multi-process leasing/orchestration across separate workers
- external workflow-engine adapters
