# @mission-control/adapter-sqlite

`@mission-control/adapter-sqlite` is the SQLite-backed durable adapter package.

It is the durable production adapter for the v1 single-instance runtime model.

It provides:

- `createSqlitePersistenceAdapter`
- `SQLiteCommander` as a compatibility convenience wrapper over the shared commander path
- durable persistence for mission state, history, attempts, signals, and timers
- restart-safe resume for waiting signals, sleep timers, and retry backoff

## Requirement

This package relies on Node's built-in SQLite module (`node:sqlite`) on Node.js
24+. Node.js 25+ is recommended.

## Example

```ts
import { createSqlitePersistenceAdapter } from "@mission-control/adapter-sqlite";
import { createCommander } from "@mission-control/core";
import { reminderMission } from "./reminder-mission.ts";

const commander = createCommander({
	persistence: createSqlitePersistenceAdapter({
		databasePath: "./missions.sqlite",
	}),
	definitions: [reminderMission],
});

const mission = await commander.start(reminderMission, {
	recipient: "hello@example.com",
	message: "Persist me",
});
```

Runtime integration example:

```ts
import { createSqlitePersistenceAdapter } from "@mission-control/adapter-sqlite";
import { createCommanderRuntime } from "@mission-control/runtime";

const runtime = createCommanderRuntime({
	adapter: createSqlitePersistenceAdapter({
		databasePath: "./missions.sqlite",
	}),
	definitions: [reminderMission],
});

await runtime.start();
runtime.setNextTickIn(5_000);
```

## Notes

- Prefer `createSqlitePersistenceAdapter(...)` with `createCommander(...)` or `createCommanderRuntime(...)` for new code.
- `SQLiteCommander` is retained for compatibility and delegates to the same shared commander implementation.
- This adapter persists recoverable mission state, but it does not upgrade user-defined side effects to exactly-once execution.
- If an app crashes after an external side effect but before the next inspection save, replay or retry may re-enter user code after reload.
- It persists mission state and recovery coordination, but external side effects remain at-least-once unless your application code is idempotent.
- This adapter is designed for the MVP single-instance runtime model rather than claim/lease multi-instance orchestration.
- Prefer durable filesystem paths for `databasePath` in production-like environments and avoid ephemeral temp directories for long-lived mission state.
