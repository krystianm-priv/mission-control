# ROADMAP.md

This roadmap defines the real path to Mission Control v1.

It intentionally overrides any older repository claims that imply v1 has already been achieved.

## V0 reality check

What the repository appears to have today:

- a typed mission DSL
- an execution engine for start / step / wait / sleep / retry flows
- an in-memory runtime
- experiments around durable persistence
- examples and tests that prove useful local behavior

What that does **not** automatically mean:

- that Mission Control is already a credible Temporal / DBOS competitor
- that durability semantics are production-grade
- that side effects are safely modeled
- that restart / recovery semantics are fully trustworthy
- that package layout or naming is settled
- that the repo is ready for `npm publish`

Treat the current codebase as **pre-v1**.

## Product direction

Mission Control v1 should be:

- a TypeScript mission / workflow runtime
- centered on a clean shared execution model
- explicit about waits, retries, timers, and inspection
- adapter-oriented for durable storage / recovery backends
- minimal enough to actually ship
- honest about what it does not solve yet

## V1 release bar

Mission Control v1 is only real when all of the following are true:

1. `@mission-control/core` is publishable and documented.
2. `@mission-control/in-memory-commander` is publishable and documented.
3. the durable backend architecture is clearly adapter-based under `adapters/*`.
4. at least one durable adapter package is publishable and documented.
5. restart-safe recovery for signals, timers, and retries is proven for the first durable adapter.
6. docs no longer overclaim completion or maturity.
7. package names, workspace layout, exports, examples, and release scripts match reality.
8. the repo is explicit about known limits and non-goals.

## Naming and structure direction

Durable backends belong under:

- `adapters/<name>`

with package names like:

- `@mission-control/adapter-sqlite`
- `@mission-control/adapter-postgres`

This roadmap is intentionally **not** hardcoded around a single adapter.
The first production-worthy durable adapter may be SQLite or Postgres depending on what reaches the release bar first.

## Non-goals for v1

v1 does **not** need to include:

- workflow versioning for already-running missions
- visual builders
- browser-first runtimes
- Temporal / DBOS bridge adapters
- generic BPM / orchestration designer tooling
- multi-cluster distribution
- every possible durable backend
- a perfect multi-worker architecture

## Milestone 1 — Repository truth reset

### MC-001 — Rewrite control docs around the real pre-v1 state
**Status:** [x]

Scope:

- remove or rewrite any wording that claims v1 is already complete
- make docs describe the current repo as pre-v1
- align docs with the adapter-based architecture
- explicitly stop treating old package layout as fixed truth

Acceptance criteria:

- root docs no longer imply v1 has already shipped
- adapter-oriented structure is reflected in docs
- docs describe the current repo honestly

### MC-002 — Align workspace and package naming with the adapter model
**Status:** [ ]

Depends on:

- MC-001

Scope:

- introduce `adapters/*` as a workspace root
- move or mirror durable backend packages into adapter-shaped locations
- use names like `@mission-control/adapter-sqlite`
- remove documentation drift between old and new package names

Acceptance criteria:

- workspace config includes `adapters/*`
- durable adapter package names follow `@mission-control/adapter-<name>`
- docs and examples reference the real package names

## Milestone 2 — Core boundary hardening

### MC-003 — Make the durable adapter contract explicit in core
**Status:** [ ]

Depends on:

- MC-002

Scope:

- define the minimum persistence / recovery contract in `core`
- ensure `core` stays runtime-neutral
- make adapter expectations explicit for bootstrapping, loading, saving, listing, and recovery
- keep `core` free of backend-specific assumptions

Acceptance criteria:

- the adapter contract is clearly defined in public types and docs
- `core` does not reference backend-specific details
- a new durable adapter can be understood from `core` contracts alone

### MC-004 — Make mission inspection and recovery state a first-class durable unit
**Status:** [ ]

Depends on:

- MC-003

Scope:

- validate that the inspection shape is sufficient for recovery
- tighten any missing fields required for restart-safe continuation
- ensure waits, retries, timers, and errors are durably representable

Acceptance criteria:

- mission state required for recovery is explicit
- tests cover rehydration from persisted state
- no hidden in-memory-only assumptions remain in the durable contract

## Milestone 3 — Execution model honesty

### MC-005 — Audit side-effect and replay semantics for v1 honesty
**Status:** [ ]

Depends on:

- MC-004

Scope:

- identify where current execution semantics are safe
- identify where they are not safe enough to overclaim
- document the exact v1 guarantees around retries, recovery, and user code execution
- avoid pretending snapshot persistence alone solves replay / idempotency

Acceptance criteria:

- v1 guarantees are documented precisely
- known unsafe or limited areas are called out
- no public docs imply stronger guarantees than the engine actually provides

### MC-006 — Tighten retry, timer, and signal recovery semantics in the shared engine
**Status:** [ ]

Depends on:

- MC-005

Scope:

- ensure recovery semantics are explicit and testable
- remove edge cases where waiting state and runtime state can drift
- strengthen inspection / history consistency where needed

Acceptance criteria:

- engine-level recovery tests exist for retry / timer / signal paths
- state transitions are internally consistent
- recovery behavior is deterministic under tested conditions

## Milestone 4 — First real durable adapter

### MC-007 — Choose the first production-quality durable adapter and make it the v1 reference backend
**Status:** [ ]

Depends on:

- MC-006

Scope:

- evaluate the existing adapter candidates in the repo
- pick the one that can most credibly reach v1 first
- make that adapter the reference durable backend for v1 docs and examples
- keep the broader adapter architecture intact

Acceptance criteria:

- one durable adapter is clearly identified as the first v1 backend
- that choice is justified in docs
- the repo does not imply that all adapters are equally mature

### MC-008 — Make the first durable adapter restart-safe for signals, timers, and retries
**Status:** [ ]

Depends on:

- MC-007

Scope:

- complete bootstrap / persistence / load / recovery behavior
- prove reload and continuation for waiting missions
- ensure adapter tests cover real recovery paths

Acceptance criteria:

- tests demonstrate restart-safe recovery
- signals, sleeps, and retry backoff survive reload
- adapter docs match actual behavior

### MC-009 — Make the first durable adapter publishable
**Status:** [ ]

Depends on:

- MC-008

Scope:

- fix exports
- fix package metadata
- fix README and examples
- ensure tarball contents and package boundaries are clean

Acceptance criteria:

- the chosen adapter package is publishable
- package metadata is accurate
- examples use the real package and API surface

## Milestone 5 — Release path cleanup

### MC-010 — Align examples with the real public architecture
**Status:** [ ]

Depends on:

- MC-009

Scope:

- update examples to use `core`, `in-memory-commander`, and the reference adapter
- remove examples that reinforce outdated naming or architecture
- keep examples minimal and honest

Acceptance criteria:

- examples compile against the real package layout
- examples do not reference outdated package names
- examples demonstrate the intended v1 API

### MC-011 — Align verification and release scripts with the real package graph
**Status:** [ ]

Depends on:

- MC-010

Scope:

- update workspace scripts
- ensure pack / test / typecheck commands reflect the actual publishable units
- avoid hardcoding outdated package names

Acceptance criteria:

- root scripts operate on the real workspace structure
- release verification covers the intended public packages
- no stale package references remain

### MC-012 — Final documentation pass for an honest v1
**Status:** [ ]

Depends on:

- MC-011

Scope:

- ensure root README, package READMEs, roadmap, and sourcemap all match
- clearly document the first durable adapter
- clearly document non-goals and known limits

Acceptance criteria:

- public docs match reality
- docs are consistent across the repo
- v1 claims are narrow, truthful, and defensible

## Known likely v1 limits

These are acceptable for v1 unless the roadmap later says otherwise:

- single-process oriented recovery may be acceptable
- multi-worker claiming / leasing may remain post-v1
- workflow versioning may remain post-v1
- some user-code idempotency responsibilities may remain on the app developer
- only one durable adapter may be production-grade at v1 time
