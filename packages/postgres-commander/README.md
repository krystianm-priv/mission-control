# @mission-control/postgres-commander

`@mission-control/postgres-commander` is the durable Mission Control runtime for v1.

It provides:

- `createPgPersistenceAdapter`
- `PgCommander`
- Postgres schema bootstrap and migration `0001_init`
- durable persistence for mission state, history, attempts, signals, and timers
- restart-safe resume for waiting signals, sleep timers, and retry backoff

## Runtime contract

The preferred v1 API is `createCommander(...)` from `@mission-control/core` plus `createPgPersistenceAdapter(...)` from this package.
`PgCommander` remains as a thin compatibility wrapper around that shared implementation.

The Postgres adapter does not own a database client. You pass a single `execute(query: string)` function and keep control of the underlying Postgres connection.
It is a concrete implementation of `CommanderPersistenceAdapter` from `@mission-control/core`.

The executor may return:

- an array of row objects
- an object with a `rows` array
- a PGlite `.exec(...)` result array

## Intended app wiring

```ts
import { db } from "@/drizzle/index.ts";
import { createCommander } from "@mission-control/core";
import { createPgPersistenceAdapter } from "@mission-control/postgres-commander";
import { reminderMission } from "./reminder-mission.ts";

const commander = createCommander({
	definitions: [reminderMission],
	persistence: createPgPersistenceAdapter({
		execute: (query) => db.execute(query),
	}),
});
```

## Minimal local example

```ts
import { createCommander } from "@mission-control/core";
import { createPgPersistenceAdapter } from "@mission-control/postgres-commander";
import { reminderMission } from "./reminder-mission.ts";

const commander = createCommander({
	definitions: [reminderMission],
	persistence: createPgPersistenceAdapter({
		execute: (query) => db.execute(query),
	}),
});

const mission = await commander.start(reminderMission, {
	recipient: "hello@example.com",
	message: "Persist me",
});
```

## Notes

- The commander stores JSON payloads and inspection state in a single `mc_missions` table.
- The package does not inject a query builder or ORM. It only requires the raw `execute(query)` boundary.
- Optional local tests may use `@electric-sql/pglite`, but it is not part of the required runtime story.
