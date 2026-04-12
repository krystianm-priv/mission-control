# SOURCEMAP.md

## Current repository map

### Root

- `README.md`
  - Concept-first explanation of Missions.
  - Strong philosophy, but not yet a release-ready product README.

- `package.json`
  - Bun workspace root.
  - Has root `build`, `dev`, and `lint`, but not a full release pipeline.

- `turbo.json`
  - Basic task wiring.
  - Needs to expand for test and typecheck discipline.

- `biome.json`
  - Formatting/linting baseline.

### `packages/core`

Current role:
- contains the mission DSL builder in `m.ts`

Current important files:
- `packages/core/m.ts`
  - mission definition DSL
  - generic schema typing
  - context/event typing
  - `toStatic()` projection

Main issue:
- good conceptual core, but still a single-file prototype shape

### `packages/commander`

Current role:
- contains the in-memory runtime in `commander.ts`

Current important files:
- `packages/commander/commander.ts`
  - current in-memory mission runtime
  - mission registry and instances
  - start/signal flow
  - placeholder validation bypass

Main issue:
- execution loop, state model, storage, and API are all still tightly mixed

### `examples/ask-user-for-review`

Current role:
- demonstrates a human-in-the-loop mission

Important files:
- `src/mission-definition.ts`
  - good canonical example of `needTo(...)`
- `src/db.ts`
  - example-only SQLite persistence
- `src/utils.ts`
  - fake integrations and record update logic

Main issue:
- demonstrates the concept well, but not the production v1 runtime story

### `examples/order-fulfillment`

Current role:
- demonstrates a business workflow with two external signals

Important files:
- `src/mission-definition.ts`
  - good example of sequential + external event flow
- `src/utils.ts`
  - fake domain integrations

Main issue:
- still concept/demo oriented; does not prove durability, retries, timers, or inspection

## Target v1 repository map

### Root

- `README.md`
  - product README for v1
  - install, quick start, guarantees, non-goals

- `ROADMAP.md`
  - execution plan and source of truth for autonomous agents

- `AGENTS.md`
  - agent operating manual tied to the roadmap

- `SOURCEMAP.md`
  - this document

### `packages/core`

Target role:
- mission-definition DSL only
- shared public types needed by all commanders
- schema/runtime validation helpers
- retry and timer metadata types

Suggested shape:

```text
packages/core/
  src/
    index.ts
    mission-definition.ts
    schema.ts
    errors.ts
    retry-policy.ts
    timer.ts
    types.ts
```

Rules:
- no Postgres logic
- no in-memory storage logic
- no external engine bridge logic

### `packages/commander`

Target role:
- shared commander contracts
- shared mission execution engine / interpreter
- in-memory commander
- testing helpers that describe baseline semantics

Suggested shape:

```text
packages/commander/
  src/
    index.ts
    contracts.ts
    engine.ts
    validation.ts
    errors.ts
    in-memory/
      commander.ts
      store.ts
    testing/
      fixtures.ts
```

Rules:
- shared runtime semantics live here
- do not move Postgres-specific SQL or locking here

### `packages/postgres-commander`

Target role:
- durable Postgres-backed commander
- schema and migrations
- leasing / claiming
- timers and retries persistence
- worker loop
- inspection queries

Suggested shape:

```text
packages/postgres-commander/
  src/
    index.ts
    commander.ts
    store.ts
    worker.ts
    leasing.ts
    serialization.ts
    migrations/
    sql/
```

Rules:
- all Postgres-specific concerns belong here
- transaction boundaries should be explicit
- this package is the core of the v1 durable story

### `examples`

Target role:
- prove the v1 product story

Expected examples:

- `ask-user-for-review`
  - human-in-the-loop waiting flow
- `order-fulfillment`
  - durable signals, inspection, retries where sensible
- `durable-reminder`
  - timer-based continuation with Postgres

## Architectural direction

The architecture should converge on this split:

1. **Mission definition** in `core`
2. **Execution semantics** in `commander`
3. **Durable Postgres implementation** in `postgres-commander`
4. **Examples and docs** proving the public story

## v1 semantic minimum

By v1, the repo should clearly support:

- `start` with runtime validation
- `step`
- `needTo` external waits
- durable `signal`
- retries
- timers
- inspection APIs
- in-memory execution
- Postgres durable execution

## Explicitly out of scope for v1

- workflow versioning for already-running missions
- external workflow engine bridges
- a visual workflow editor
- a frontend-first mission runtime story
