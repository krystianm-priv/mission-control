# SOURCEMAP.md

## Current repository map

### Root

- `README.md`
  - v1 product README with package layout, quick start, and validation commands

- `package.json`
  - npm workspace root
  - root `build`, `check-types`, `test`, and `release:check` scripts

- `turbo.json`
  - workspace task wiring for build, lint, typecheck, and test

- `tsconfig.base.json`
  - shared compiler baseline for packages and examples

### `packages/core`

Current role:
- mission definition DSL
- schema parsing helpers
- retry and timer metadata

Important files:
- `packages/core/src/mission-definition.ts`
  - builder for `start`, `step`, `needTo`, `sleep`, `end`
- `packages/core/src/schema.ts`
  - runtime schema parsing and validation failure handling
- `packages/core/src/retry-policy.ts`
  - retry normalization and backoff calculation
- `packages/core/src/timer.ts`
  - timeout and timer metadata types

### `packages/commander`

Current role:
- shared runtime contracts and execution engine
- in-memory commander
- test fixtures for deterministic semantic testing

Important files:
- `packages/commander/src/contracts.ts`
  - public runtime snapshot/history/inspection types
- `packages/commander/src/engine.ts`
  - shared execution loop, retries, timers, external waits, completion handling
- `packages/commander/src/in-memory/commander.ts`
  - public in-memory commander implementation
- `packages/commander/src/testing/fixtures.ts`
  - fake clock for deterministic timer/timeout tests

### `packages/postgres-commander`

Current role:
- durable Postgres package surface
- schema, migrations, serialization, store primitives, and leasing SQL

Important files:
- `packages/postgres-commander/src/sql.ts`
  - schema DDL and runnable mission claim SQL
- `packages/postgres-commander/src/migrations/0001_init.ts`
  - initial migration
- `packages/postgres-commander/src/store.ts`
  - storage-only query primitives
- `packages/postgres-commander/src/serialization.ts`
  - explicit JSON persistence format
- `packages/postgres-commander/src/worker.ts`
  - claim helper for worker loops

Main limitation:
- end-to-end durable runtime execution still needs a real Postgres instance

### `examples/ask-user-for-review`

Current role:
- human-in-the-loop in-memory example using the public packages

Important files:
- `src/mission-definition.ts`
  - canonical `needTo(...)` mission
- `src/index.ts`
  - starts, signals, waits for completion, prints inspection output

### `examples/order-fulfillment`

Current role:
- longer sequential example with two external signals

Important files:
- `src/mission-definition.ts`
  - start, step, wait, signal, completion flow
- `src/index.ts`
  - demonstrates public commander APIs and inspection

## Architectural direction

The repository now follows the intended split:

1. `core`: mission definition and shared validation/types
2. `commander`: runtime semantics and in-memory execution
3. `postgres-commander`: Postgres-specific schema/store/leasing surface
4. `examples`: public API usage
