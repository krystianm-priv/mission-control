# Mission Control

Mission Control is a TypeScript workflow / mission runtime for long-lived application flows.

It is being built in the same broad problem space as tools like Temporal and DBOS, but with a smaller, sharper, more explicit v1.

## Current status

Mission Control is a pilot-ready v1 runtime for controlled production use.

The repository now contains:

- a typed mission definition DSL
- a shared execution engine
- an explicit in-memory runtime
- a managed embedded runtime loop
- a Postgres durable adapter with task records, history records, claims, lease expiry, cancellation records, and restart recovery
- client and CLI helpers for starting, inspecting, listing, signalling, updating, and cancelling missions
- tests and examples for waits, signals, timers, retries, recovery, claims, and cancellation

Pilot-ready means Mission Control is suitable for limited production rollouts where operators understand the runtime model and application code makes external side effects idempotent.

## Product direction

Mission Control v1 is intended to provide:

- a typed mission / workflow DSL
- an explicit execution model
- support for:
  - sequential steps
  - external signals
  - sleeps / timers
  - retries / backoff
- inspection APIs
- restart-safe recovery through a durable adapter
- a clean boundary between:
  - shared runtime logic
  - in-memory execution
  - durable storage adapters

## Repository architecture

The intended architecture is:

### `@mission-control/core`

Owns:

- the mission definition DSL
- shared contracts and types
- validation helpers
- retry and timer primitives
- the shared execution engine
- commander abstractions
- durable adapter-facing persistence contracts and recovery contract helpers

This package should remain runtime-neutral.

### `@mission-control/in-memory-commander`

Owns:

- the explicit in-memory runtime adapter
- local testing helpers
- deterministic development behavior

This is the fast local runtime for tests, examples, and development.

### `@mission-control/adapter-*`

Durable backends live under `adapters/*` and should be published with names like:

- `@mission-control/adapter-sqlite`
- `@mission-control/adapter-postgres`

Adapters own backend-specific concerns such as:

- schema and migrations
- serialization
- storage reads and writes
- durable recovery behavior
- backend-specific tests

`core` must not absorb those concerns.

## First v1 backend

The first reference durable backend for Mission Control v1 is `@mission-control/adapter-postgres`.

That choice is based on the current repository state:

- `@mission-control/adapter-postgres` is already shaped like a publishable package
- its publishable tarball is now scoped to runtime source plus README instead of test fixtures
- it uses an explicit `execute(query, params?)` boundary instead of relying on Node experimental runtime features
- the durable example and release-pack flow point at the Postgres adapter
- restart-recovery coverage for signals, sleep timers, and retry backoff already exists for it

`@mission-control/adapter-sqlite` remains valuable for local comparison and continued iteration, but it is not the reference v1 backend today.

## Workspace direction

The repository workspace is shaped like:

- `core`
- `runtime`
- `client`
- `testing`
- `cli`
- `adapters/*`
- `examples/*`

The current adapter directories include:

- `adapters/in-memory`
- `adapters/postgres`
- `adapters/sqlite`

`@mission-control/core` now lives at the repo root, and the runtime implementations live under `adapters/*`.

## What Mission Control does well already

Today the repo already demonstrates:

- typed start and signal inputs
- additive mission metadata for queries, updates, and schedules
- mission flows with explicit waits
- timer-based pauses
- retry policy metadata and execution
- mission inspection state
- rehydration-oriented runtime state
- thin `runtime` and `client` package boundaries around the preserved mission DSL

That makes it a strong foundation.

## Pilot production limits

The pilot-ready runtime still has explicit limits:

- Postgres is the only pilot production backend.
- Embedded runtimes coordinate through Postgres task claims and leases; Mission Control is not a multi-cluster orchestration system.
- External side effects are at-least-once unless application code supplies idempotency.
- Workflow versioning for already-running missions is not included.
- There is no web dashboard.

## Current execution guarantees

Today, Mission Control is explicit about waits, retries, timers, and inspection state, but it is still conservative about side-effect guarantees.

What the current runtime does guarantee:

- mission inspection captures the durable state needed to recover waiting signals, sleep timers, retry backoff, cancellation, and terminal failures
- the Postgres adapter records durable task rows, history rows, cancellation rows, and claim leases for embedded multi-instance coordination
- claimed Postgres tasks are not claimed by another runtime while their lease is valid
- expired Postgres leases can be reclaimed after a runtime crash
- recovery can rehydrate waiting and running missions from persisted inspection state
- retries, timer wakeups, signal handling, updates, and cancellations are explicit in mission history and inspection output
- additive mission queries and updates can be registered on definitions and executed through mission handles

What the current runtime does not guarantee:

- exactly-once execution of user-defined side effects
- automatic idempotency for `start` handlers, step bodies, or timer-triggered work
- protection against replaying user code after a crash between a side effect and the next persisted inspection write

The practical rule for v1 is:

- treat Mission Control as durable for mission state and recovery coordination
- treat application side effects as at-least-once unless your own code makes them idempotent

## Operator basics

`@mission-control/runtime` exposes a managed embedded runtime with:

- `identity`
- `pollIntervalMs`
- `batchSize`
- `leaseTimeoutMs`
- structured logger hooks
- metric hooks

`@mission-control/cli` provides JSON operator commands:

```bash
mission-control list --waiting
mission-control list --scheduled
mission-control inspect <missionId>
mission-control cancel <missionId> "operator reason"
```

The CLI does not own a database client. Set `MISSION_CONTROL_POSTGRES_EXECUTE_MODULE` to a local module that exports `execute(query, params?)`.

For rollback or shutdown, stop embedded runtimes gracefully. In-flight claimed work either completes or is released by shutdown; if a process crashes, another runtime may reclaim work after the lease expires.

## Non-goals for v1

v1 does **not** need to include:

- visual builders
- browser-first runtimes
- Temporal bridge adapters
- DBOS bridge adapters
- generic BPM designer tooling
- every possible durable backend
- multi-cluster orchestration

## Example: in-memory mission

```ts
import { createCommander, m } from "@mission-control/core";

const approvalMission = m
	.define("approval")
	.start({
		input: {
			parse: (input) => {
				const value = input as { email?: unknown };
				if (typeof value.email !== "string" || !value.email.includes("@")) {
					throw new Error("Invalid approval input.");
				}
				return { email: value.email };
			},
		},
		run: async ({ ctx }) => ({ email: ctx.events.start.input.email }),
	})
	.step("send-email", async ({ ctx }) => ({
		sentTo: ctx.events.start.output.email,
	}))
	.needTo("receive-approval", {
		parse: (input) => {
			const value = input as { approvedBy?: unknown };
			if (typeof value.approvedBy !== "string") {
				throw new Error("Invalid approval signal.");
			}
			return { approvedBy: value.approvedBy };
		},
	})
	.end();

const commander = createCommander({
	definitions: [approvalMission],
});

const mission = await commander.start(approvalMission, {
	email: "ops@example.com",
});

await mission.signal("receive-approval", { approvedBy: "reviewer-1" });

console.log(mission.inspect());
