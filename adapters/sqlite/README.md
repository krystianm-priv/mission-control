# @mission-control/adapter-sqlite

`@mission-control/adapter-sqlite` is the SQLite-backed durable adapter package.

It is one of the supported MVP adapters for Mission Control v1.

It provides:

- `SQLiteCommander`
- `createSqlitePersistenceAdapter`
- SQLite schema bootstrap and migration `0001_init`
- durable persistence for mission state, history, attempts, signals, and timers
- restart-safe resume for waiting signals, sleep timers, and retry backoff

## Requirement

This package relies on Node's built-in SQLite module (`node:sqlite`) on Node.js 24+.

## Example

```ts
import { join } from "node:path";

import { SQLiteCommander } from "@mission-control/adapter-sqlite";
import { reminderMission } from "./reminder-mission.ts";

const commander = new SQLiteCommander({
	databasePath: join(process.cwd(), "missions.sqlite"),
	definitions: [reminderMission],
});

const mission = commander.createMission(reminderMission);
await mission.start({
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

- This adapter persists recoverable mission state, but it does not upgrade user-defined side effects to exactly-once execution.
- If an app crashes after an external side effect but before the next inspection save, replay or retry may re-enter user code after reload.
- It persists mission state and recovery coordination, but external side effects remain at-least-once unless your application code is idempotent.
- This adapter is designed for the MVP single-instance runtime model rather than claim/lease multi-instance orchestration.
- Prefer durable filesystem paths for `databasePath` in production-like environments and avoid ephemeral temp directories for long-lived mission state.
