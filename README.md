# Mission Control

Mission Control is a TypeScript workflow runtime for long-lived, typed missions.

The v1 release candidate ships three publishable packages:

- `@mission-control/core`
- `@mission-control/in-memory-commander`
- `@mission-control/sqlite-commander`

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
- a durable SQLite runtime that persists state and resumes after reload

## What v1 does not include

- workflow versioning for already-running missions
- Postgres
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

### `@mission-control/sqlite-commander`

Owns:

- the `SQLiteCommander` implementation
- schema bootstrap and migrations
- durable persistence for waits, retries, timers, and inspection state
- restart-safe local/dev durability using SQLite

## Requirements

- Node.js `22.11+`
- `zod` in your app if you use Zod schemas

`@mission-control/sqlite-commander` uses Node’s built-in experimental SQLite support.
That means SQLite examples and tests run with `node --experimental-sqlite ...`.

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

## Durable SQLite example

```ts
import { join } from "node:path";
import { z } from "zod";

import { m } from "@mission-control/core";
import { SQLiteCommander } from "@mission-control/sqlite-commander";

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

const commander = new SQLiteCommander({
	databasePath: join(process.cwd(), "mission-control.sqlite"),
	definitions: [reminderMission],
});

const mission = commander.createMission(reminderMission);
await mission.start({
	recipient: "hello@example.com",
	message: "This mission survives process reloads through SQLite state.",
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
