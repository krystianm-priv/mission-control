# Mission Control

Mission Control is a TypeScript workflow runtime for long-lived, typed missions.

The release model is intentionally pure Node.js `24+` plus TypeScript:

- no compile step is required to run the repo
- packages publish source-first `.ts` entrypoints
- the v1 package story avoids external runtime dependencies

The v1 release candidate ships three publishable packages:

- `@mission-control/core`
- `@mission-control/in-memory-commander`
- `@mission-control/postgres-commander`

## What it ships today

- typed mission definitions
- runtime input validation for `start(...)` and `signal(...)`
- sequential steps
- external waits with `needTo(...)`
- timer waits with `sleep(...)`
- retry policies with backoff metadata
- inspection APIs for mission snapshot, history, attempts, signals, and timers
- an explicit abstract `Commander` base class in core
- a shared `createCommander(...)` API with pluggable persistence adapters
- an in-memory runtime for tests and fast local execution
- a durable Postgres adapter that persists state and resumes after reload

## What v1 does not include

- workflow versioning for already-running missions
- adapters to Temporal, DBOS, RabbitMQ, or other workflow engines
- visual builders
- browser-first runtimes

## Runtime packages

### `@mission-control/core`

Owns:

- the mission DSL
- shared types and validation helpers
- retry and timer metadata
- the abstract `Commander` base class
- the shared configurable commander runtime and persistence adapter contract
- runtime-neutral contracts and shared execution engine

### `@mission-control/in-memory-commander`

Owns:

- the `InMemoryCommander` compatibility wrapper
- deterministic testing helpers

### `@mission-control/postgres-commander`

Owns:

- the Postgres persistence adapter and `PgCommander` compatibility wrapper
- schema bootstrap and migrations
- durable persistence for waits, retries, timers, and inspection state
- restart-safe reload and resume
- a minimal `execute(query: string)` integration boundary

## Requirements

- Node.js `24+`

`@mission-control/postgres-commander` does not require a specific client library.
You provide a single `execute(query: string)` function that runs raw SQL against Postgres.

```ts
const commander = createCommander({
	definitions: [durableReminderMission],
	persistence: createPgPersistenceAdapter({
		execute: (query) => db.execute(query),
	}),
});
```

The durable test suite may use `@electric-sql/pglite` when it is installed locally so the repo can verify Postgres semantics without external infrastructure, but it is not part of the required runtime story.

## Persistence adapters

`createCommander(...)` accepts an optional `persistence` adapter.
If you provide one, the adapter persists whole `MissionInspection` objects and drives restart-safe recovery through `listRecoverableInspections()`.

For v1, the minimum supported contract is:

- `bootstrap()` for one-time startup work before recovery
- `saveInspection(inspection)` to persist the latest runtime state
- `loadInspection(missionId)` to load one mission by id
- `listWaitingSnapshots()` and `listScheduledSnapshots()` for inspection APIs
- `listRecoverableInspections()` for startup rehydration
- optional synchronous `close()` cleanup

The built-in Postgres package is one implementation of that contract, and the default behavior with no adapter remains in-memory.
If an adapter initializes asynchronously, `start(...)` waits for readiness automatically and `waitUntilReady()` is available before direct `createMission(...)` calls.

## Quick start

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
```

## Durable Postgres example

```ts
import { createCommander, m } from "@mission-control/core";
import { createPgPersistenceAdapter } from "@mission-control/postgres-commander";

const reminderMission = m
	.define("reminder")
	.start({
		input: {
			parse: (input) => {
				const value = input as { recipient?: unknown; message?: unknown };
				if (
					typeof value.recipient !== "string" ||
					!value.recipient.includes("@") ||
					typeof value.message !== "string" ||
					value.message.length === 0
				) {
					throw new Error("Invalid reminder input.");
				}
				return {
					recipient: value.recipient,
					message: value.message,
				};
			},
		},
		run: async ({ ctx }) => ctx.events.start.input,
	})
	.sleep("wait-before-send", 1_000)
	.step("send-reminder", async ({ ctx }) => ({
		sentTo: ctx.events.start.output.recipient,
		body: ctx.events.start.output.message,
	}))
	.end();

const commander = createCommander({
	definitions: [reminderMission],
	persistence: createPgPersistenceAdapter({
		execute: (query) => db.execute(query),
	}),
});

const mission = await commander.start(reminderMission, {
	recipient: "hello@example.com",
	message: "This mission survives process reloads through durable Postgres state.",
});
await mission.waitForCompletion();
```

## Verification

```bash
npm run release:check
npm run release:pack
```

## Examples

- `examples/ask-user-for-review`
- `examples/order-fulfillment`
- `examples/durable-reminder`
