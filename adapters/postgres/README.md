# @mission-control/adapter-postgres

`@mission-control/adapter-postgres` is the Postgres-backed durable adapter package.

It is the reference durable backend for Mission Control pilot production use.

It provides:

- `createPgPersistenceAdapter`
- `PgCommander`
- Postgres schema bootstrap and migration `0001_init`
- durable persistence for mission state, history, attempts, signals, and timers
- restart-safe resume for waiting signals, sleep timers, and retry backoff
- durable runtime task records, history records, cancellation records, claims, and lease expiry

## Runtime contract

The current recommended API is `createCommander(...)` from `@mission-control/core` plus `createPgPersistenceAdapter(...)` from this package.
`PgCommander` remains as a thin compatibility wrapper around that shared implementation.

## Publishable surface

The package tarball is intentionally scoped to:

- `src/**`
- `README.md`

Repository tests and workspace-only files are excluded from the published package so the adapter boundary stays clean.

The Postgres adapter does not own a database client. You pass a single `execute(query: string, params?: readonly unknown[])` function and keep control of the underlying Postgres connection.
It is a concrete implementation of `CommanderPersistenceAdapter` from `@mission-control/core`.

The executor may return:

- an array of row objects
- an object with a `rows` array
- a PGlite `.exec(...)` result array

## Intended app wiring

```ts
import { db } from "@/drizzle/index.ts";
import { createCommander } from "@mission-control/core";
import { createPgPersistenceAdapter } from "@mission-control/adapter-postgres";
import { reminderMission } from "./reminder-mission.ts";

const commander = createCommander({
	definitions: [reminderMission],
	persistence: createPgPersistenceAdapter({
		execute: (query, params) => db.execute(query, params),
	}),
});
```

## Minimal local example

```ts
import { createCommander } from "@mission-control/core";
import { createPgPersistenceAdapter } from "@mission-control/adapter-postgres";
import { reminderMission } from "./reminder-mission.ts";

const commander = createCommander({
	definitions: [reminderMission],
	persistence: createPgPersistenceAdapter({
		execute: (query, params) => db.execute(query, params),
	}),
});

const mission = await commander.start(reminderMission, {
	recipient: "hello@example.com",
	message: "Persist me",
});
```

## Notes

- The commander stores JSON payloads and inspection state in `mc_missions`.
- Runtime coordination uses `mc_runtime_tasks`, `mc_runtime_history`, and `mc_runtime_cancellations`.
- The package does not inject a query builder or ORM. It only requires the raw `execute(query, params?)` boundary.
- Optional local tests may use `@electric-sql/pglite`, but it is not part of the required runtime story.
- This adapter persists recoverable mission state, but it does not upgrade user-defined side effects to exactly-once execution.
- If an app crashes after an external side effect but before the next inspection save, replay or retry may re-enter user code after reload.
- It is the v1 reference backend because it is publishable, example-backed, and has restart and lease coverage.

## Proven recovery paths

The current adapter test suite proves restart-safe reload and continuation for:

- waiting signal missions that survive a commander restart and can be resumed afterward
- scheduled sleep timers that remain discoverable through `listScheduled()` and complete after reload
- scheduled retry backoff that remains discoverable through `listScheduled()` and resumes after reload
- task claims that exclude another runtime while the lease is valid
- task reclaim after lease expiry
- persisted operator cancellation requests
