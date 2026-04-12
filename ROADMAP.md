# ROADMAP.md

## Goal

Ship `mission-control` v1 as a publishable TypeScript workflow system with:

- `@mission-control/core`
- `@mission-control/in-memory-commander`
- `@mission-control/sqlite-commander`
- typed mission definitions
- runtime validation
- retries and timers
- inspection APIs
- durable SQLite persistence and restart-safe resume

This roadmap intentionally **excludes** workflow versioning for in-flight missions and any Postgres runtime. Postgres is a v1.1 concern.

## Release bar

v1 RC is done only when all of the following are true:

1. `@mission-control/core` is publishable, documented, and exposes the abstract commander base.
2. `@mission-control/in-memory-commander` is publishable and tested.
3. `@mission-control/sqlite-commander` is publishable and tested.
4. Missions survive process restarts and continue from SQLite state.
5. Signals, retries, and timers work durably in SQLite.
6. Mission state and history can be inspected programmatically.
7. Examples demonstrate the real public v1 story.
8. All publishable tarballs are clean enough that the next step is `npm publish`.

## Milestone 0 — Source of truth and package structure

### MC-001 — Rewrite control docs for the SQLite v1 architecture
**Depends on:** none  
**Status:** [x]

### MC-002 — Rename `packages/commander` to `packages/in-memory-commander`
**Depends on:** MC-001  
**Status:** [x]

### MC-003 — Remove Postgres from the v1 product story
**Depends on:** MC-001  
**Status:** [x]

## Milestone 1 — Core architecture

### MC-004 — Move runtime-neutral contracts and abstract `Commander` base into `@mission-control/core`
**Depends on:** MC-002  
**Status:** [x]

### MC-005 — Keep the mission DSL, validation, retries, and timers coherent under the new core package surface
**Depends on:** MC-004  
**Status:** [x]

## Milestone 2 — In-memory runtime

### MC-006 — Rebuild the in-memory package around explicit runtime instantiation
**Depends on:** MC-004  
**Status:** [x]

### MC-007 — Lock down in-memory semantics with tests
**Depends on:** MC-006  
**Status:** [x]

## Milestone 3 — SQLite durable runtime

### MC-008 — Add SQLite schema/bootstrap and storage primitives
**Depends on:** MC-004  
**Status:** [x]

### MC-009 — Implement `SQLiteCommander` lifecycle, persistence, and inspection APIs
**Depends on:** MC-008, MC-006  
**Status:** [x]

### MC-010 — Implement restart-safe resume, durable signals, retries, and timers in SQLite
**Depends on:** MC-009, MC-005  
**Status:** [x]

### MC-011 — Add durable SQLite tests for reload/resume semantics
**Depends on:** MC-010  
**Status:** [x]

## Milestone 4 — Examples and release truth

### MC-012 — Update examples to use the real public packages and APIs
**Depends on:** MC-007, MC-011  
**Status:** [x]

### MC-013 — Add a durable SQLite example
**Depends on:** MC-011  
**Status:** [x]

### MC-014 — Rewrite the README and package READMEs so they match the shipped product
**Depends on:** MC-012, MC-013  
**Status:** [x]

### MC-015 — Clean package metadata, exports, tarballs, and verification scripts for release
**Depends on:** MC-014  
**Status:** [x]

## v1.1 later

- Postgres durable backend
- multi-process leasing beyond SQLite’s local-process strengths
- broader operator/deployment guidance for larger production use
