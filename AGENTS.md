# AGENTS.md

## Purpose

Use this file as the default operating manual for coding agents working in this repository.

This repository is building `mission-control`: a TypeScript workflow / mission runtime intended to compete in the same broad space as Temporal and DBOS, but with a much smaller, sharper v1.

Treat the current repository state as **pre-v1** even if some existing files, docs, examples, package versions, or comments imply otherwise.

The goal is **not** to preserve old claims about “v1 complete”.
The goal is to make the repository actually worthy of a first real v1 release.

## Read order

Read these files first, in order:

1. `ROADMAP.md`
2. `SOURCEMAP.md`
3. root `README.md`
4. files directly related to the selected task

## Core product direction

Mission Control should become a workflow runtime with:

- a typed workflow / mission definition DSL
- a shared execution engine
- explicit waiting semantics for:
  - external signals
  - timers / sleeps
  - retries / backoff
- a clean runtime boundary between:
  - `core`
  - the in-memory local runtime
  - durable adapters
- restart-safe mission recovery
- an architecture that can support multiple durable adapters without deforming the core

## Current reality rule

Assume the repo is a **useful prototype / V0**, not a finished v1.

Do not preserve or repeat claims such as:

- “v1 is already achieved”
- “release candidate is done”
- “npm publish is the immediate next step”

unless the roadmap and current implementation actually justify them.

## Repository layout

Primary product areas:

- `core`
- `adapters/in-memory`
- `adapters/*`
- `examples/*`
- `package.json` workspace and release scripts
- root docs (`README.md`, `AGENTS.md`, `ROADMAP.md`, `SOURCEMAP.md`)

Expected adapter layout:

- `adapters/sqlite` → `@mission-control/adapter-sqlite`
- `adapters/postgres` → `@mission-control/adapter-postgres`
- additional durable backends may follow the same pattern later

## Architecture rules

### 1. Core stays runtime-neutral

`core` owns:

- the mission DSL
- shared types and contracts
- validation helpers
- retry / timer policy primitives
- the shared engine
- the abstract commander/runtime contracts
- adapter-facing persistence contracts

`core` must not become coupled to SQLite, Postgres, queues, ORMs, or framework-specific concerns.

### 2. Durable backend logic belongs in adapters

Anything specific to a durable backend belongs under `adapters/*`.

Examples:

- schema / migrations
- row serialization
- SQL generation
- storage recovery semantics
- polling / claim / lease mechanics
- backend-specific bootstrapping

Do not move durable-backend details into `core`.

### 3. Do not hardcode the product around one adapter

Do not assume that one specific adapter is “the product”.

The product is:

- `core`
- the execution model
- the adapter contract
- at least one credible durable adapter

A specific adapter may be the first one to reach production quality, but the repo structure and docs must not pretend that one backend is the only valid future.

### 4. In-memory stays explicit

`adapters/in-memory` is for:

- local development
- examples
- tests
- deterministic validation of engine behavior

Do not turn it into global singleton state or hidden default magic.

### 5. Shared engine first

If logic is common across in-memory and durable execution, keep it behind shared engine/runtime contracts.

Do not duplicate behavior across adapters unless backend differences truly require it.

### 6. Smallest real v1

Prefer the smallest complete solution that creates a credible v1.

Do not add:

- visual builders
- config-first JSON workflow systems
- browser-first runtime support
- Temporal / DBOS bridge layers
- speculative distributed features
- broad abstraction layers for backends that do not exist yet

unless the roadmap explicitly requires them.

## Source-of-truth rule

When instructions conflict:

1. the selected open task in `ROADMAP.md`
2. this `AGENTS.md`
3. the current codebase structure
4. older comments / docs / examples

If older docs claim something that `ROADMAP.md` contradicts, follow `ROADMAP.md`.

## Task selection protocol

At the start of each session:

1. Open `ROADMAP.md`.
2. Find the first task with `**Status:** [ ]` whose dependencies are complete.
3. Select that task.
4. Read only the files needed for that task.
5. Implement the smallest complete solution that satisfies the task.
6. Add or update tests.
7. Update docs if public behavior, naming, or structure changed.
8. Mark the task complete only when it is actually complete.

## Execution rules

### 1. Keep diffs tight

Prefer small, logically complete diffs.

Do not mix unrelated cleanup into the task unless required for correctness.

### 2. Preserve type safety

Prefer strict, explicit types.

Do not weaken types just to silence the compiler.

### 3. Preserve explicit runtime semantics

Mission execution must stay understandable.

Avoid hidden control flow, invisible retries, implicit persistence, or “magic” behavior that makes debugging harder.

### 4. Durability claims must be earned

Do not describe something as durable, restart-safe, or production-ready unless the implementation and tests actually support that claim.

### 5. Side effects must be treated seriously

Any design that mixes persistence and user-defined side effects must be evaluated carefully.

Do not casually assume that snapshot persistence alone is enough to guarantee safe replay / retry / recovery semantics.

### 6. Adapters are first-class package boundaries

New durable backends belong in:

- `adapters/<name>`

with package names shaped like:

- `@mission-control/adapter-<name>`

### 7. Tests are mandatory

A roadmap task is not complete without tests appropriate to the change.

Use focused unit tests where possible.
Use backend-specific tests for adapter durability behavior when needed.

### 8. Docs are part of the task

When changing public APIs, naming, architecture, or package structure, update:

- root `README.md`
- relevant package / adapter README
- `SOURCEMAP.md`
- `ROADMAP.md` if task status or wording changed

## Definition of done

A task is done only when all of the following are true:

- code typechecks
- changed behavior is covered by tests
- public exports are correct
- docs are updated where needed
- `ROADMAP.md` marks the task complete
- the diff remains scoped to the selected task

## Allowed roadmap edits

You may edit `ROADMAP.md` only to:

- mark tasks complete
- add narrowly scoped child tasks revealed by implementation
- clarify wording where implementation exposed ambiguity
- update package / directory references when the repo structure changes

Do not silently lower the v1 bar.
Do not silently redefine the product around the current implementation’s limitations.

## Preferred working pattern

1. Restate the chosen task in one sentence.
2. Inspect the relevant files.
3. Implement.
4. Run focused validation.
5. Update docs.
6. Update roadmap.
7. Report clearly.

## Final response format

End each session with exactly these sections:

### Completed
- list the roadmap task ID(s) completed

### Changed
- list the important files changed

### Validation
- list the commands run and the outcome

### Commit message
- provide one concise commit message

### Next prompt
- `pick the logically next task from ROADMAP.md`
