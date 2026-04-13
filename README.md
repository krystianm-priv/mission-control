# Mission Control

Mission Control is a TypeScript workflow / mission runtime for long-lived application flows.

It is being built in the same broad problem space as tools like Temporal and DBOS, but with a smaller, sharper, more explicit v1.

## Current status

Mission Control is currently **pre-v1**.

The repository already contains useful pieces:

- a typed mission definition DSL
- a shared execution engine
- an explicit in-memory runtime
- experiments around durable persistence
- tests and examples for waits, signals, timers, and retries

But this does **not** yet mean:

- v1 is complete
- durability guarantees are fully production-grade
- the publishable package story is final
- the current repo structure is the final architecture

This repository should be treated as an active productization effort, not a finished release candidate.

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
- durable adapter-facing persistence contracts

This package should remain runtime-neutral.

### `@mission-control/in-memory-commander`

Owns:

- the explicit in-memory runtime
- local testing helpers
- deterministic development behavior

This is the fast local runtime for tests, examples, and development.

### `@mission-control/adapter-*`

Durable backends belong under `adapters/*` and should be published with names like:

- `@mission-control/adapter-sqlite`
- `@mission-control/adapter-postgres`

Adapters own backend-specific concerns such as:

- schema and migrations
- serialization
- storage reads and writes
- durable recovery behavior
- backend-specific tests

`core` must not absorb those concerns.

## Workspace direction

The repository is moving toward a workspace layout shaped like:

- `packages/core`
- `packages/in-memory-commander`
- `adapters/*`
- `examples/*`

Durable backends should live in `adapters/*`, not in `packages/*`.

Today, the durable runtime experiments still live under:

- `packages/postgres-commander`
- `packages/sqlite-commander`

That package layout is transitional. The adapter-shaped move is tracked separately in `ROADMAP.md` as `MC-002`.

## What Mission Control does well already

Today the repo already demonstrates:

- typed start and signal inputs
- mission flows with explicit waits
- timer-based pauses
- retry policy metadata and execution
- mission inspection state
- rehydration-oriented runtime state

That makes it a strong foundation.

## What still needs to become true for v1

Mission Control v1 is only real once all of the following are true:

- package naming and workspace structure match the adapter-oriented architecture
- the durable adapter contract is clearly defined in `core`
- at least one durable adapter is genuinely publishable
- restart-safe recovery for signals, timers, and retries is proven for that adapter
- docs stop overclaiming current maturity
- examples, exports, and release scripts match the real package graph

## Honest v1 limits

The first real v1 will likely still have limits.

Acceptable likely limits include:

- single-process oriented recovery
- no workflow versioning for already-running missions
- only one production-grade durable adapter
- some idempotency responsibility remaining with application code
- no multi-worker claim / lease system yet

Those are acceptable as long as they are stated clearly and not hidden behind inflated claims.

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
