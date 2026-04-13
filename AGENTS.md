# AGENTS.md

## Purpose

Use this file as the default operating manual for coding agents working in this repository.

The goal is to ship `mission-control` v1 as a real release candidate whose immediate next step is `npm publish`.

This repository is intentionally a pure Node.js `24+` plus TypeScript project:

- no compile step is required for normal development or runtime execution
- source packages ship directly from `src/*.ts`
- the public v1 story should avoid external runtime dependencies

Read these files first, in order:

1. `ROADMAP.md`
2. `SOURCEMAP.md`
3. root `README.md`
4. the files directly related to the selected task

## North star

Ship a real TypeScript workflow runtime with:

- `@mission-control/core`
- `@mission-control/in-memory-commander`
- `@mission-control/postgres-commander`

v1 must include:

- typed mission definitions
- a solid in-memory commander
- a durable Postgres commander
- retries
- timers
- inspection APIs
- restart-safe reload/resume for the Postgres runtime
- native Node.js `24+` execution of `.ts` source via erasable syntax
- no required external runtime dependencies in the v1 package story

v1 does **not** include workflow versioning for already-running missions.

## Hard boundaries

Do not do any of the following unless the roadmap explicitly requires it:

- do not add bridges/adapters to Temporal, DBOS, RabbitMQ, or other workflow engines
- do not add visual builders
- do not redesign the project into a generic BPM platform
- do not add browser-first runtime support
- do not sneak in large refactors unrelated to the current roadmap task
- do not change the mission DSL philosophy into config-first JSON

## Repository scope

Everything in this repo is in scope.

Treat these areas as the primary product surface:

- `packages/core`
- `packages/in-memory-commander`
- `packages/postgres-commander`
- `examples/*`
- root docs (`README.md`, `ROADMAP.md`, `SOURCEMAP.md`, package READMEs)

## Source-of-truth rule

When task instructions conflict:

1. the current task in `ROADMAP.md` wins
2. then this `AGENTS.md`
3. then the current codebase structure

## Task selection protocol

At the start of each session:

1. Open `ROADMAP.md`.
2. Find the first task with `**Status:** [ ]` whose dependencies are all complete.
3. Select that task.
4. Read only the files needed to complete that task.
5. Implement the smallest complete solution that satisfies the task's acceptance criteria.
6. Add or update tests.
7. Update any docs/exports touched by the change.
8. Mark the task complete in `ROADMAP.md` only when it is actually done.

## Execution rules

### 1. Keep changes tight

Prefer small, logically complete diffs.

Do not mix unrelated cleanup into the task unless it is required for correctness.

### 2. Preserve type safety

Prefer stricter, explicit types.

Do not weaken types to get around compiler problems.

### 3. Preserve the architecture

The intended architecture is:

- `core`: workflow definition DSL, validation, shared contracts, shared engine, abstract `Commander`
- `in-memory-commander`: in-memory runtime
- `postgres-commander`: durable Postgres-backed runtime behind an `execute(query: string)` boundary

The intended delivery model is source-first:

- publish `.ts` source packages for Node.js `24+`
- avoid dist/build artifacts in the public release path
- keep runtime semantics inside Node.js with no bundler requirement

### 4. Shared engine first

If logic is needed by both commanders, put it behind shared runtime contracts instead of duplicating it.

### 5. Postgres-specific logic stays Postgres-specific

Schema, SQL persistence, durable timers, and recovery rules specific to Postgres belong in `postgres-commander`, not in `core`.

### 6. Do not over-design

Pick the smallest API that satisfies the roadmap and is plausible for v1.

Do not add speculative abstractions for imagined future backends.

### 7. Tests are mandatory

A roadmap task is not complete without tests appropriate to the change.

Use focused unit tests for local logic and optional PGlite-backed tests for durable Postgres semantics when that dependency is available locally.

### 8. Docs are part of the task

When public APIs or semantics change, update:

- the relevant package README
- root `README.md` if user-facing behavior changed
- `SOURCEMAP.md` if the repo structure changed materially

## Definition of done

A task is done only when all of the following are true:

- the code compiles
- tests for the changed behavior exist and pass
- public exports are correct
- docs are updated where needed
- `ROADMAP.md` is updated to mark the task complete
- the resulting diff remains scoped to the selected task

## Allowed roadmap edits

You may edit `ROADMAP.md` only to:

- mark tasks complete
- add narrowly scoped child tasks when implementation reveals a missing release-bar item
- clarify wording where the implementation revealed ambiguity

Do not silently redefine v1 away from the actual shipped packages.

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
