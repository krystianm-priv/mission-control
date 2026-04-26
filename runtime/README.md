# @mission-control/runtime

`@mission-control/runtime` provides the managed embedded runtime around the core commander API.

It preserves Mission Control's mission terminology and DSL while giving applications a runtime boundary for startup recovery ticks, explicit next-tick scheduling, shutdown, logs, and metrics.

```ts
import { createCommanderRuntime } from "@mission-control/runtime";
import { createSqlitePersistenceAdapter } from "@mission-control/adapter-sqlite";

const runtime = createCommanderRuntime({
	adapter: createSqlitePersistenceAdapter({ databasePath: "./missions.sqlite" }),
	definitions: [reminderMission],
	identity: "single-instance-runtime",
	logger: (event) => console.log(event),
	metrics: (event) => metrics.record(event.name, event.value, event.tags),
});

await runtime.start();
runtime.setNextTickIn(10 * 60 * 1000);
```

SQLite-backed runtime persistence is currently preview because it depends on
Node's built-in `node:sqlite` module, which is not a Stability 2 API yet.

Runtime behavior summary:

- startup runs an initial tick to check incomplete work
- one tick can run at a time (`tick()` returns `false` if one is already in flight)
- ticks are allowed to find no work
- runtime supports explicit timeout scheduling for the next tick (`setNextTickAt`, `setNextTickIn`)
- ticks should not chain additional ticks from inside tick execution
- mission continuations are resumed without making tick own mission scope

`stop()` clears pending next-tick timers, waits for an in-flight tick to settle, closes the commander, and then resolves.

## Public API

- `start(): Promise<void>`
	- waits for commander readiness
	- schedules startup `start_at*` tick timing from adapter data
	- runs one immediate startup tick
- `tick(): Promise<boolean>`
	- returns `false` when runtime is stopped or when another tick is already running
	- returns `true` after a completed tick pass (including empty ticks)
- `setNextTickAt(at: Date): void`
	- schedules the next tick for an absolute time
	- replaces any previously scheduled next tick
- `setNextTickIn(ms: number): void`
	- convenience wrapper for relative scheduling
- `isTickRunning(): boolean`
	- reports whether a tick is currently in-flight
- `stop(): Promise<void>`
	- clears next tick timer, waits for in-flight tick, closes commander

## Migration notes: removed polling and claim concepts

`@mission-control/runtime` no longer provides polling/claim APIs.

Removed concepts:

- polling interval runtime loops
- claim-based task ownership and lease expiry
- claim completion/failure/release callbacks

Current replacements:

- explicit tick scheduling through `setNextTickAt` and `setNextTickIn`
- single-instance execution with a one-tick-at-a-time guard
- adapter-driven discovery of incomplete missions and persisted `start_at*` wakeup entries

Old-to-new API mapping:

- `pollIntervalMs` loop cadence -> `setNextTickAt(...)` or `setNextTickIn(...)`
- `claimRuntimeTasks(...)` work discovery -> adapter `listIncompleteMissionIds(...)`
- `releaseRuntimeClaims(...)` shutdown cleanup -> `stop()` timer cleanup + in-flight tick drain
- claim ownership lease semantics -> `isTickRunning()` single-flight tick guard

If your previous integration used claim APIs, migrate by moving wake-up decisions to adapter persistence and scheduling the next runtime tick explicitly from application orchestration code.
