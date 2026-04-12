# @mission-control/sqlite-commander

`@mission-control/sqlite-commander` is the durable Mission Control runtime for v1.

It provides:

- `SQLiteCommander`
- SQLite schema bootstrap and migration `0001_init`
- durable persistence for mission state, history, attempts, signals, and timers
- restart-safe resume for waiting signals, sleep timers, and retry backoff

## Requirement

This package relies on Node’s built-in experimental SQLite support, so SQLite-based runs use:

```bash
node --experimental-sqlite ...
```

## Example

```ts
import { join } from "node:path";

import { SQLiteCommander } from "@mission-control/sqlite-commander";
import { reminderMission } from "./reminder-mission.js";

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
