# Mission Control

Mission Control is a TypeScript workflow runtime for long-lived, typed missions.

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
- an in-memory runtime for tests and fast local execution
- a durable Postgres runtime that persists state and resumes after reload

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
- runtime-neutral contracts and shared execution engine

### `@mission-control/in-memory-commander`

Owns:

- the `InMemoryCommander` implementation
- deterministic testing helpers

### `@mission-control/postgres-commander`

Owns:

- the `PgCommander` implementation
- schema bootstrap and migrations
- durable persistence for waits, retries, timers, and inspection state
- restart-safe reload and resume
- a minimal `execute(query: string)` integration boundary

## Requirements

- Node.js `22.11+`

`@mission-control/postgres-commander` does not require a specific client library.
You provide a single `execute(query: string)` function that runs raw SQL against Postgres.

```ts
const commander = new PgCommander({
	definitions: [durableReminderMission],
	execute: (query) => db.execute(query),
});
```

The durable test suite uses `@electric-sql/pglite` when it is installed locally so the repo can verify Postgres semantics without external infrastructure.

## Quick start

```ts
import { z } from "zod";
import { m } from "@mission-control/core";
import { InMemoryCommander } from "@mission-control/in-memory-commander";

const approvalMission = m
	.define("approval")
	.start({
		input: z.strictObject({ email: z.email() }),
		run: async ({ ctx }) => ({ email: ctx.events.start.input.email }),
	})
	.step("send-email", async ({ ctx }) => ({
		sentTo: ctx.events.start.output.email,
	}))
	.needTo("receive-approval", z.strictObject({ approvedBy: z.string() }))
	.end();

const commander = new InMemoryCommander({
	definitions: [approvalMission],
});
const mission = commander.createMission(approvalMission);

await mission.start({ email: "ops@example.com" });
await mission.signal("receive-approval", { approvedBy: "reviewer-1" });

console.log(mission.inspect());
```

## Durable Postgres example

```ts
import { PGlite } from "@electric-sql/pglite";
import { z } from "zod";

import { m } from "@mission-control/core";
import { PgCommander } from "@mission-control/postgres-commander";

const reminderMission = m
	.define("reminder")
	.start({
		input: z.strictObject({ recipient: z.email(), message: z.string() }),
		run: async ({ ctx }) => ctx.events.start.input,
	})
	.sleep("wait-before-send", 1_000)
	.step("send-reminder", async ({ ctx }) => ({
		sentTo: ctx.events.start.output.recipient,
		body: ctx.events.start.output.message,
	}))
	.end();

const db = await PGlite.create("./mission-control-pgdata");

const commander = new PgCommander({
	definitions: [reminderMission],
	execute: (query) => db.exec(query),
});

const mission = commander.createMission(reminderMission);
await mission.start({
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
