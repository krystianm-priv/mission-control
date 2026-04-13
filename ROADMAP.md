# ROADMAP.md

This roadmap tracks the real v1 release candidate for `mission-control`.

The repo target is a pure Node.js `24+` plus TypeScript release:

- no compile step required for normal usage
- publish source-first packages from `src/*.ts`
- no required external runtime dependencies in the core v1 story

The shipped package set is:

- `@mission-control/core`
- `@mission-control/in-memory-commander`
- `@mission-control/postgres-commander`

v1 includes:

- typed mission definitions
- in-memory execution
- durable Postgres persistence
- retries
- timers
- inspection APIs
- restart-safe reload/resume

v1 does **not** include workflow versioning for already-running missions.

## Release bar

1. `@mission-control/core` is publishable and documented.
2. `@mission-control/in-memory-commander` is publishable and tested.
3. `@mission-control/postgres-commander` is publishable and tested.
4. Missions survive process reloads and continue from durable Postgres state.
5. Signals, retries, and timers work durably through the Postgres runtime.
6. Root docs, examples, exports, scripts, and tarballs match reality.
7. The release path is explicit about being Node.js `24+` plus TypeScript with no required build step.

## Milestone 1 — Repository truth

### MC-001 — Rewrite control docs for the Postgres v1 architecture
**Status:** [x]

### MC-002 — Keep package names, exports, and examples aligned with the real release target
**Status:** [x]

## Milestone 2 — Core and in-memory runtime

### MC-003 — Expose the abstract `Commander` base class and runtime-neutral contracts from core
**Status:** [x]

### MC-004 — Keep the in-memory commander explicit and singleton-free
**Status:** [x]

### MC-005 — Cover mission validation, waits, retries, timers, and inspection semantics with local tests
**Status:** [x]

## Milestone 3 — Durable Postgres runtime

### MC-006 — Implement Postgres schema/bootstrap and inspection serialization
**Status:** [x]

### MC-007 — Implement a durable `PgCommander` behind an `execute(query: string)` contract
**Status:** [x]

### MC-008 — Support restart-safe reload/resume for signals, sleep timers, and retry backoff
**Status:** [x]

### MC-009 — Add durable runtime tests using PGlite when available locally
**Status:** [x]

## Milestone 4 — Release candidate cleanup

### MC-010 — Update README, package READMEs, and examples to the final public API and Node 24 source-first runtime story
**Status:** [x]

### MC-011 — Ensure typecheck, test, lint, and pack scripts reflect the real no-build release path
**Status:** [x]

### MC-012 — Keep published source-package tarballs free of accidental junk and non-v1 packages
**Status:** [x]

## Milestone 5 — Post-RC API follow-up

### MC-013 — Document and stabilize the `createCommander(...)` persistence-adapter API
**Status:** [x]

Scope:

- define the minimum supported `CommanderPersistenceAdapter` contract for third-party durable backends
- document expected semantics for bootstrap, save/load, waiting/scheduled listing, and restart-safe recovery
- add focused examples for adapter-driven usage in addition to compatibility wrappers
- verify the shared factory API remains aligned with the three-package v1 release story

## Known v1 limits

- the Postgres runtime currently targets single-process usage, not multi-worker leasing
- durable tests may optionally use `@electric-sql/pglite` when it is installed locally, but it is not part of the required v1 runtime story
- no workflow versioning for already-running missions
