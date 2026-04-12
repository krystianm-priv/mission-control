# SOURCEMAP.md

## Current repository map

### Root

- `README.md`
  - product README for the SQLite-based v1 story

- `package.json`
  - npm workspace root
  - release-oriented scripts for build, typecheck, test, and pack validation

- `turbo.json`
  - workspace task wiring

- `tsconfig.base.json`
  - shared TypeScript baseline

### `packages/core`

Current role:
- mission DSL
- shared types and validation helpers
- retry and timer metadata
- abstract `Commander` base class
- runtime-neutral contracts and shared execution engine

Important files:
- `packages/core/src/mission-definition.ts`
- `packages/core/src/commander.ts`
- `packages/core/src/contracts.ts`
- `packages/core/src/engine.ts`
- `packages/core/src/schema.ts`

### `packages/in-memory-commander`

Current role:
- in-memory runtime implementation
- deterministic test helpers

Important files:
- `packages/in-memory-commander/src/commander.ts`
- `packages/in-memory-commander/src/testing/fixtures.ts`
- `packages/in-memory-commander/src/commander.test.ts`
  - implemented as `src/in-memory/commander.ts` and `src/in-memory/commander.test.ts`

### `packages/sqlite-commander`

Current role:
- durable SQLite runtime implementation for v1
- schema bootstrap and migrations
- persistence, signals, timers, retries, and rehydration

Important files:
- `packages/sqlite-commander/src/commander.ts`
- `packages/sqlite-commander/src/store.ts`
- `packages/sqlite-commander/src/schema.ts`
- `packages/sqlite-commander/src/migrations/*`
- `packages/sqlite-commander/src/*.test.ts`

Operational note:
- SQLite runtime and tests use Node’s built-in experimental SQLite support via `--experimental-sqlite`

### `examples`

Expected examples:
- `ask-user-for-review`
  - human-in-the-loop flow using the public packages
- `order-fulfillment`
  - sequential + signal flow using the public packages
- `durable-reminder`
  - SQLite-backed durability and timer/reload flow

## Architectural direction

The repository converges on:

1. `core`: definition, semantics, shared contracts, abstract runtime base
2. `in-memory-commander`: fast reference runtime
3. `sqlite-commander`: durable local/dev runtime for v1
4. `examples`: public API usage only

## v1 semantic minimum

By v1 RC, the repo must clearly support:

- `start` with runtime validation
- `step`
- `needTo`
- `sleep`
- retry policies
- inspection APIs
- in-memory execution
- durable SQLite execution
- restart/reload continuity through SQLite

## Explicitly out of scope for v1

- Postgres durable runtime
- workflow versioning for already-running missions
- external workflow engine bridges
- visual builders
- frontend-first runtime support
