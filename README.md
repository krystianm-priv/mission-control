# Mission Control

Mission Control is a Node.js 24+ TypeScript workflow / mission runtime for long-lived application flows.

It targets a focused MVP with:

- a typed mission definition DSL
- durable mission inspection state
- explicit waits, retries, timers, and signals
- single-instance runtime orchestration through ticks
- an in-memory adapter and a SQLite preview adapter

## Current status

Mission Control MVP is intentionally narrow:

- available adapters: `@mission-control/in-memory-commander`, `@mission-control/adapter-sqlite`
- runtime model: single-instance, tick-driven
- side-effect model: at-least-once unless application code provides idempotency
- source-first packages that run TypeScript directly on Node.js 24+

`@mission-control/adapter-sqlite` is a preview durable adapter because it relies
on Node's built-in `node:sqlite` module, which is not a Stability 2 API yet.
The adapter is included for durable MVP usage, but its backend should be treated
as release-candidate infrastructure until Node marks SQLite stable.

## MVP package status

| Package | Status | Notes |
| --- | --- | --- |
| `@mission-control/core` | Supported | Mission DSL, engine, contracts |
| `@mission-control/runtime` | Supported | Single-instance tick runtime |
| `@mission-control/client` | Supported | Runtime-owned mission client helpers |
| `@mission-control/testing` | Supported | Shared testing helpers |
| `@mission-control/in-memory-commander` | Supported | Local/in-memory adapter surface |
| `@mission-control/adapter-sqlite` | Preview | Durable SQLite adapter surface backed by `node:sqlite` |
| `examples/*` | Private examples | Reference usage patterns, not published APIs |

## Repository architecture

### `@mission-control/core`

Owns:

- mission definition DSL
- shared contracts and types
- validation helpers
- retry and timer primitives
- shared execution engine
- commander abstractions

This package remains runtime-neutral.

### `@mission-control/in-memory-commander`

Owns:

- explicit in-memory runtime adapter
- local testing helpers
- deterministic local behavior

### `@mission-control/adapter-sqlite`

Owns:

- sqlite schema and migrations
- serialization and persistence
- durable recovery behavior for waits and retries
- backend-specific tests

The primary integration path is `createSqlitePersistenceAdapter(...)` with
`createCommander(...)` or `createCommanderRuntime(...)`. `SQLiteCommander` is
kept as a compatibility convenience wrapper over the same shared commander path.

### `@mission-control/runtime`

Owns:

- startup tick to inspect incomplete jobs
- explicit next-tick scheduling (`setNextTickAt`, `setNextTickIn`)
- single-flight tick guarantees (one tick at a time)
- logger and metric hooks around runtime/tick lifecycle

### Other packages

- `@mission-control/client`: mission-native client helpers
- `@mission-control/testing`: shared test helpers

## Execution semantics

Mission Control is durable for:

- mission state snapshots
- waits, retries, timers, cancellation requests
- restart recovery coordination

Mission Control does not provide exactly-once side-effect guarantees for user code.

Practical rule:

- treat mission state as durable
- treat external side effects as at-least-once unless your application code is idempotent

## Runtime tick model

The runtime is built around explicit ticks:

1. startup runs a tick that checks incomplete jobs
2. next tick can be scheduled by timeout (`setNextTickAt` / `setNextTickIn`)
3. only one tick runs at a time
4. a tick can start or continue missions but does not own full mission scope
5. startup can schedule ticks for persisted `start_at*` timer entries
6. a tick can run even when no jobs are due
7. a tick does not chain a follow-up tick automatically

## Migration notes: polling and claims removed

This MVP removes the polling and lease-claim runtime model entirely.

Concept mapping from older runtime designs:

- polling loop (`pollIntervalMs`) -> explicit scheduling (`setNextTickAt`, `setNextTickIn`)
- claim batches (`batchSize`) -> one single-instance tick pass over incomplete missions
- lease ownership (`identity` + lease timeout) -> process-local single-flight tick guard (`isTickRunning`)
- claim completion/failure hooks -> mission resume logs and metrics (`mission-resume-started`, `mission-resume-failed`)
- claim release on shutdown -> timer cleanup + in-flight tick drain on `stop()`

Migration checklist:

1. Remove runtime configuration fields tied to polling and leases.
2. Configure startup with `createCommanderRuntime(...)`, then call `start()`.
3. Use `setNextTickAt(...)` or `setNextTickIn(...)` from application code when deferred work should trigger another tick window.
4. Keep retry/timer durability in adapter persistence; do not attempt to recreate multi-worker claim ownership logic.
5. Update operational expectations: one process, one tick at a time, no automatic tick chaining.

## Release process

Release work for MVP is intentionally explicit and human-driven.

1. Run validation: `npm run release:check`
2. Verify package tarballs: `npm run release:pack`
3. Ensure docs and changelog are updated for API/semantics changes.
4. Human operators perform dependency updates, generated-file actions, and lockfile modifications.
5. Human operators run publish commands after dry-run verification.

## Non-goals for MVP

- multi-instance claim/lease orchestration
- multi-cluster coordination
- visual workflow builders
- browser-first runtime
- broad backend matrix

## In-memory example

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
