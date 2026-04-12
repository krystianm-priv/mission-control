# AGENTS.md

## Purpose

Use this file as the default operating manual for coding agents working in this repository.

The goal is to ship a truthful `mission-control` v1 release candidate whose next literal step is `npm publish`.

Read these files first, in order:

1. `ROADMAP.md`
2. `SOURCEMAP.md`
3. root `README.md`
4. the files directly related to the selected task

## North star

Ship a real TypeScript workflow runtime with:

- `@mission-control/core`
- `@mission-control/in-memory-commander`
- `@mission-control/sqlite-commander`

v1 must include:

- typed mission definitions
- runtime input validation
- a real abstract `Commander` base class in `@mission-control/core`
- a solid in-memory commander
- a durable SQLite commander
- retries
- timers
- inspection APIs
- restart-safe local durability through SQLite

v1 does **not** include workflow versioning for already-running missions.
Postgres is **not** part of v1. It belongs to v1.1 and later.

## Hard boundaries

Do not do any of the following unless the roadmap explicitly requires it:

- do not add bridges/adapters to Temporal, DBOS, RabbitMQ, or other workflow engines
- do not add visual builders
- do not redesign the project into a generic BPM platform
- do not add browser-first runtime support
- do not leave singleton commander globals in the public API
- do not sneak in large refactors unrelated to the current roadmap task
- do not change the mission DSL philosophy into config-first JSON

## Repository scope

Everything in this repo is in scope.

Treat these areas as the primary product surface:

- `packages/core`
- `packages/in-memory-commander`
- `packages/sqlite-commander`
- `examples/*`
- root docs (`README.md`, `ROADMAP.md`, `SOURCEMAP.md`, package READMEs)

## Source-of-truth rule

When task instructions conflict:

1. the current task in `ROADMAP.md` wins
2. then this `AGENTS.md`
3. then the current codebase structure

Do not work from vague intuitions when the roadmap is specific.

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

If a task is too large to complete cleanly in one session, split it into smaller child tasks directly under the same milestone before changing code.

## Execution rules

### 1. Keep changes tight

Prefer small, logically complete diffs.

Do not mix unrelated cleanup into the task unless it is required for correctness.

### 2. Preserve type safety

Prefer stricter, explicit types.

Do not weaken types to get around compiler problems.

Do not add `any` unless there is no practical alternative and the choice is localized and justified.

### 3. Preserve the architecture

The intended architecture is:

- `core`: mission DSL, shared types, validation helpers, retry/timer metadata, abstract commander base, runtime-neutral contracts
- `in-memory-commander`: in-memory runtime implementation only
- `sqlite-commander`: durable SQLite-backed runtime only

Do not collapse these boundaries casually.

### 4. Shared engine first

If logic is needed by both commanders, put it in `@mission-control/core` behind runtime-neutral contracts instead of duplicating it.

### 5. SQLite-specific logic stays SQLite-specific

Schema, migrations, SQL, persistence, durable timers, recovery, and idempotency constraints specific to SQLite belong in `sqlite-commander`, not in `core`.

### 6. Do not over-design

Pick the smallest API that satisfies the roadmap and is plausible for v1.

Do not add speculative abstractions for imagined future backends.

### 7. Tests are mandatory

A roadmap task is not complete without tests appropriate to the change.

Use focused unit tests for local logic and integration tests for SQLite durability, retries, timers, and restart/reload behavior.

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
- add narrowly scoped child tasks when a parent task is too large
- clarify wording where the implementation revealed ambiguity
- move Postgres work explicitly to v1.1 when v1 truth requires it

Do not silently redefine v1.

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

## Notes on ambition

v1 succeeds only by shipping the roadmap honestly.

That means:

- get the SQLite commander real
- get the semantics clear
- get the examples convincing
- avoid architecture wandering

Ship the next real task, not the imagined future platform.
