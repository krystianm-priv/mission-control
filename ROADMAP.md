# ROADMAP.md

## Goal

Ship `mission-control` v1 as a publishable TypeScript workflow system with:

- a production-grade `PostgresCommander`
- a solid `InMemoryCommander`
- typed mission definitions
- durable mission persistence
- crash-safe resume
- retries and backoff
- timers / scheduled wakeups
- multi-worker-safe execution
- observability and inspection APIs

This roadmap intentionally **excludes workflow versioning / migration of in-flight missions** from v1.

## Non-goals for v1

Do not spend v1 time on:

- bridging to Temporal, DBOS, RabbitMQ, or any other external workflow engine
- visual builders
- browser-first runtimes
- workflow versioning for already-running missions
- fancy branching DSLs beyond what is needed for a credible v1 runtime

## Release bar

v1 is done only when all of the following are true:

1. `@mission-control/core` is publishable and documented.
2. `@mission-control/commander` provides a tested in-memory commander built on shared runtime logic.
3. `@mission-control/postgres-commander` provides a tested Postgres commander with persistence and worker execution.
4. Missions survive process restarts and continue from Postgres state.
5. Signals are durable and idempotent.
6. Retries and timer wakeups work in Postgres.
7. Multiple workers can run safely without duplicate step execution.
8. Mission state and history can be inspected programmatically.
9. Examples demonstrate the real v1 story, not toy-only flows.
10. All packages build to emitted JS plus `.d.ts`, and can be consumed from a clean install.

## How to use this roadmap

- Each task has an ID, dependencies, and a completion bar.
- Work strictly in task order unless a later task has all dependencies satisfied and is clearly smaller.
- A task is not done until code, tests, docs/exports, and roadmap status are updated together.
- If a task is too large for one session, split it into child tasks directly under the same section before implementing.
- Do not silently skip acceptance criteria.

## Task selection algorithm

Pick the **first incomplete task** for which **all dependencies are already complete**.

If two tasks are both available, prefer:

1. the lower-numbered task
2. the one that reduces architectural uncertainty sooner
3. the one that unblocks more downstream tasks

## Milestone 0 — Package foundation and publishable layout

### MC-001 — Convert all packages to publishable source layout
**Depends on:** none  
**Status:** [ ]

**Outcome**
- Move package code to `src/` layouts.
- Add `index.ts` entrypoints.
- Add explicit `exports`, `types`, and emitted build outputs.
- Make package boundaries obvious and stable.

**Acceptance criteria**
- `packages/core/src/**` exists and exports only public core APIs.
- `packages/commander/src/**` exists and exports only public in-memory/shared runtime APIs.
- `packages/postgres-commander/` exists with a minimal package skeleton.
- Root workspace scripts can build all packages into real JS output.
- README examples import from public package entrypoints only.

### MC-002 — Add test, typecheck, and build pipelines that gate work
**Depends on:** MC-001  
**Status:** [ ]

**Outcome**
- Standardize `build`, `check-types`, and `test` tasks per package.
- Ensure the workspace has one obvious validation command.

**Acceptance criteria**
- Root scripts include `build`, `check-types`, and `test`.
- Each package participates in Turbo tasks or the chosen equivalent.
- CI-local command sequence is documented in the root README or contributor docs.
- A failing test or type error fails the workspace run.

## Milestone 1 — Core DSL and shared execution model

### MC-003 — Harden core types and runtime schema validation
**Depends on:** MC-002  
**Status:** [ ]

**Outcome**
- Preserve the current mission-definition philosophy while making runtime validation real.
- Eliminate the current “validation intentionally disabled” gap.

**Acceptance criteria**
- Start and signal input schemas are actually validated.
- Validation failures are typed and surfaced consistently.
- Core exports shared schema helpers / error types intentionally.
- Existing examples fail fast on invalid input.

### MC-004 — Define the shared commander contracts and runtime state model
**Depends on:** MC-003  
**Status:** [ ]

**Outcome**
- Define the runtime-neutral contracts both commanders must honor.
- Freeze the minimal v1 execution semantics before Postgres work begins.

**Acceptance criteria**
- Shared runtime types exist for mission state, waiting state, step attempt, signal record, and timer record.
- Commander interfaces cover create/start/signal/load/inspect operations.
- The meaning of statuses (`idle`, `running`, `waiting`, `completed`, `failed`) is explicitly documented in code.
- The contracts do not mention Temporal, DBOS, RabbitMQ, or bridge logic.

### MC-005 — Extract a shared execution engine from the current commander
**Depends on:** MC-004  
**Status:** [ ]

**Outcome**
- Separate mission interpretation from storage and scheduling.
- Make the engine reusable by both in-memory and Postgres commanders.

**Acceptance criteria**
- There is one shared execution loop / interpreter.
- Storage-specific concerns are behind interfaces.
- Step execution behavior is covered by focused tests.
- The current in-memory behavior is preserved unless intentionally changed by the roadmap.

## Milestone 2 — Solid in-memory commander

### MC-006 — Rebuild `InMemoryCommander` on the shared engine
**Depends on:** MC-005  
**Status:** [ ]

**Outcome**
- Keep the in-memory commander as the simplest runnable implementation of v1 semantics.
- Make it the reference implementation for fast examples and tests.

**Acceptance criteria**
- Public API is intentional and documented.
- In-memory start/signal/wait/complete/fail semantics match the shared contracts.
- No Postgres-only assumptions leak into this package.
- Examples use the public API without reaching into internals.

### MC-007 — Add a serious in-memory test suite
**Depends on:** MC-006  
**Status:** [ ]

**Outcome**
- Lock down expected mission behavior before adding durable complexity.

**Acceptance criteria**
- Tests cover successful flows, validation failures, step failures, wrong-signal errors, and waiting/resume behavior.
- Tests cover mission context accumulation and inspection APIs.
- The in-memory commander is stable enough to serve as the baseline semantic reference.

## Milestone 3 — Postgres storage and durability core

### MC-008 — Design the Postgres schema and migrations
**Depends on:** MC-005  
**Status:** [ ]

**Outcome**
- Introduce the durable data model for missions, event history, queued signals, timers, and step attempts.

**Acceptance criteria**
- Schema is written down in code and migration files.
- Tables and indexes are chosen for the expected access paths.
- The schema supports mission rehydration, durable waiting, retries, and observability.
- The schema is documented in `SOURCEMAP.md` and/or package docs.

### MC-009 — Implement the Postgres store primitives
**Depends on:** MC-008  
**Status:** [ ]

**Outcome**
- Build the low-level Postgres reads/writes before adding worker logic.

**Acceptance criteria**
- Postgres store can create missions, append events, enqueue signals, read mission snapshots, and persist status changes.
- Storage writes are transactional where needed.
- Serialization format is explicit and tested.
- The store is storage-only and does not contain orchestration logic.

### MC-010 — Implement `PostgresCommander` mission lifecycle APIs
**Depends on:** MC-009, MC-006  
**Status:** [ ]

**Outcome**
- Expose a usable Postgres commander API that mirrors v1 commander semantics.

**Acceptance criteria**
- Public APIs cover create/start/signal/load/getHistory/listWaiting/listScheduled at minimum.
- Starting a mission persists enough state to survive restarts.
- Signaling a waiting mission is durable, not process-memory-only.
- Integration tests prove mission continuation after re-instantiating the commander.

### MC-011 — Implement crash-safe resume and rehydration
**Depends on:** MC-010  
**Status:** [ ]

**Outcome**
- Make mission progress durable across process restarts and worker restarts.

**Acceptance criteria**
- A mission started before process death can be continued by a fresh process.
- Rehydration does not lose context or waiting information.
- Restart behavior is covered by integration tests.
- Failure states are preserved and inspectable.

## Milestone 4 — Reliability semantics

### MC-012 — Add step retry policy to the DSL/runtime model
**Depends on:** MC-004  
**Status:** [ ]

**Outcome**
- Introduce explicit retry semantics instead of leaving retries implicit.

**Acceptance criteria**
- Retry policy can be declared intentionally, with sensible defaults.
- The execution engine receives retry metadata without Postgres coupling.
- Errors distinguish retryable vs terminal failure paths.
- The default behavior is documented and tested.

### MC-013 — Implement Postgres retries, attempt tracking, and backoff
**Depends on:** MC-012, MC-011  
**Status:** [ ]

**Outcome**
- Make retries durable and observable.

**Acceptance criteria**
- Retry attempts are persisted.
- Backoff schedules the next eligible run durably.
- Exhausted retries mark the mission failed with structured error data.
- Integration tests prove retries survive process restarts.

### MC-014 — Add idempotent start/signal operations
**Depends on:** MC-010  
**Status:** [ ]

**Outcome**
- Prevent duplicate external requests from producing duplicate mission progress.

**Acceptance criteria**
- Starting and signaling can accept idempotency keys.
- Duplicate requests return a stable result instead of double-applying.
- The behavior is well-documented and tested.
- Postgres uniqueness constraints or equivalent safeguards enforce this durably.

## Milestone 5 — Time and scheduled wakeups

### MC-015 — Extend the DSL with timer primitives
**Depends on:** MC-004  
**Status:** [ ]

**Outcome**
- Add the minimum timer abstraction needed for a credible v1 runtime.

**Acceptance criteria**
- Core supports a timer primitive such as `sleep`, `waitFor`, or `waitUntil`.
- The API shape is small and consistent with the current DSL style.
- The semantics are documented clearly.
- In-memory and Postgres support can share the same core concept.

### MC-016 — Implement timer persistence and wakeup handling in Postgres
**Depends on:** MC-015, MC-011  
**Status:** [ ]

**Outcome**
- Scheduled waits become durable rather than process-local.

**Acceptance criteria**
- Timer records are stored durably.
- A worker can wake eligible missions after their due time.
- Timers survive process restarts.
- Integration tests cover delayed continuation.

### MC-017 — Add optional timeouts for external `needTo` waits
**Depends on:** MC-015, MC-016  
**Status:** [ ]

**Outcome**
- Support real-world waiting flows that must expire or escalate.

**Acceptance criteria**
- A mission can declare a timeout for an external wait.
- Timeout behavior is explicit: fail, continue with timeout event, or other deliberately chosen v1 rule.
- Timeout handling is durable in Postgres and deterministic in tests.

## Milestone 6 — Multi-worker safety and concurrency control

### MC-018 — Implement mission claiming / leasing for Postgres workers
**Depends on:** MC-011  
**Status:** [ ]

**Outcome**
- Ensure one runnable mission step is actively executed by one worker at a time.

**Acceptance criteria**
- The Postgres commander has a worker/runner loop or equivalent claim API.
- Claiming is safe across multiple processes.
- Stale claims can be recovered.
- Integration tests cover two workers contending for the same runnable mission.

### MC-019 — Handle concurrent signals and race conditions safely
**Depends on:** MC-014, MC-018  
**Status:** [ ]

**Outcome**
- Make the runtime robust under real multi-process event delivery.

**Acceptance criteria**
- Concurrent duplicate signals do not corrupt mission state.
- Out-of-order / unexpected signals fail clearly and durably.
- Mission history remains coherent under concurrency.
- Race-condition tests exist.

## Milestone 7 — Observability and inspection

### MC-020 — Persist structured mission history and step attempts
**Depends on:** MC-013, MC-019  
**Status:** [ ]

**Outcome**
- Give users enough history to debug why a mission is stuck, failed, or retried.

**Acceptance criteria**
- Mission history records start, signals, step outputs, failures, retries, and timer wakeups.
- Sensitive payload handling is at least consciously designed and documented.
- History can be queried without reconstructing everything from logs.

### MC-021 — Add public inspection APIs for operators and applications
**Depends on:** MC-020  
**Status:** [ ]

**Outcome**
- Expose a stable introspection surface for runtime consumers.

**Acceptance criteria**
- Public APIs exist for reading mission snapshot, status, pending wait, timer schedule, and history.
- API shapes are typed and documented.
- Both in-memory and Postgres commanders implement the portions that make sense.

## Milestone 8 — Examples, docs, and release preparation

### MC-022 — Replace toy-only examples with real v1 examples
**Depends on:** MC-017, MC-021  
**Status:** [ ]

**Outcome**
- Showcase what v1 actually is: long-lived workflows with waiting, retries, and timers.

**Acceptance criteria**
- Keep `ask-user-for-review`, but upgrade it to use real v1 APIs.
- Keep `order-fulfillment`, but make it exercise durable signals and inspection.
- Add at least one Postgres-backed example that demonstrates restart safety.

### MC-023 — Rewrite the root README and package READMEs for the v1 product
**Depends on:** MC-022  
**Status:** [ ]

**Outcome**
- Make the docs sell the actual v1 product instead of the current concept-only sketch.

**Acceptance criteria**
- Installation, package layout, and quick-start docs are accurate.
- Guarantees and non-goals are written plainly.
- The v1 docs present Mission Control as a workflow runtime with in-memory and Postgres commanders, not as a bridge to other engines.

### MC-024 — Add a release quality matrix and operational docs
**Depends on:** MC-023  
**Status:** [ ]

**Outcome**
- Document what users can rely on and what they cannot.

**Acceptance criteria**
- There is a guarantees matrix for in-memory vs Postgres commanders.
- There are docs for retries, timers, idempotency, and crash recovery.
- There is a short migration note describing what changed from the current repo state.

### MC-025 — Polish package metadata, release scripts, and clean-install verification
**Depends on:** MC-024  
**Status:** [ ]

**Outcome**
- Make the repo ready for real publication.

**Acceptance criteria**
- Package names, versions, exports, files, and licenses are correct.
- Release scripts produce publishable artifacts.
- A clean install smoke test passes against built packages.
- The repo can be tagged for `v1.0.0-rc.1`.

### MC-026 — Cut `v1.0.0`
**Depends on:** MC-025  
**Status:** [ ]

**Outcome**
- Publish the first stable release.

**Acceptance criteria**
- Final validation passes.
- Version numbers are consistent.
- Release notes summarize shipped features and explicit non-goals.

## Suggested target package layout for v1

```text
mission-control/
  README.md
  ROADMAP.md
  AGENTS.md
  SOURCEMAP.md
  package.json
  turbo.json
  packages/
    core/
      src/
        index.ts
        mission-definition.ts
        schema.ts
        errors.ts
        retry-policy.ts
        timer.ts
        types.ts
      package.json
      tsconfig.json
    commander/
      src/
        index.ts
        contracts.ts
        engine.ts
        validation.ts
        in-memory/
          commander.ts
          store.ts
        testing/
          fixtures.ts
      package.json
      tsconfig.json
    postgres-commander/
      src/
        index.ts
        commander.ts
        store.ts
        worker.ts
        leasing.ts
        migrations/
        sql/
        serialization.ts
      package.json
      tsconfig.json
  examples/
    ask-user-for-review/
    order-fulfillment/
    durable-reminder/
```

## Notes for agents

- Do not invent bridges to external workflow engines.
- Do not add versioning of in-flight missions to v1.
- Prefer the smallest coherent API surface that satisfies the release bar.
- Keep the DSL philosophy recognizable; avoid turning this into a JSON workflow builder.
