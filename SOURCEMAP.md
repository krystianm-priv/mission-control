# SOURCEMAP.md

## Root

### `README.md`

- product README for the current v1 release candidate
- describes the three public packages and the `PgCommander` execute-boundary API
- should explicitly describe the Node.js `24+` plus TypeScript, no-build, zero-runtime-dependency story

### `ROADMAP.md`

- release-bar task list for v1
- must match the real package and runtime story in the repo

### `AGENTS.md`

- agent operating manual for roadmap-first work

### `package.json`

- workspace scripts for typecheck, lint, test, and pack verification
- should reflect the no-build Node.js `24+` release path

## Packages

### `packages/core`

Purpose:

- typed mission DSL
- shared mission/runtime contracts
- validation helpers
- retry/timer metadata
- shared execution engine
- abstract `Commander` base class
- no external runtime dependencies

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
- no external runtime dependencies

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
- no required external runtime dependencies in the core package story

Key files:

- `packages/postgres-commander/src/commander.ts`
- `packages/postgres-commander/src/store.ts`
- `packages/postgres-commander/src/schema.ts`
- `packages/postgres-commander/src/sql-executor.ts`
- `packages/postgres-commander/src/migrations/*`
- `packages/postgres-commander/src/*.test.ts`

Notes:

- durable tests may use `@electric-sql/pglite` when it is installed locally
- the package itself does not depend on a specific Postgres client

## Delivery model

- packages are intended to publish source-first `.ts` entrypoints for Node.js `24+`
- the repo should not require a compile step for normal development or runtime usage

## Examples

### `examples/ask-user-for-review`

- in-memory mission example

### `examples/order-fulfillment`

- in-memory sequential mission example

### `examples/durable-reminder`

- Postgres-backed durability example using `PgCommander`
- demonstrates the `execute(query)` API without introducing a required runtime dependency

## Package boundaries

1. `core`: workflow DSL and shared runtime logic
2. `in-memory-commander`: ephemeral runtime implementation
3. `postgres-commander`: durable Postgres runtime for v1

## Out of scope for v1

- workflow versioning for already-running missions
- alternate durable backends
- multi-process leasing/orchestration across separate workers
- external workflow-engine adapters
- the legacy `packages/sqlite-commander` workspace, which is retained only as a private non-v1 package
