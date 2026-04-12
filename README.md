# Mission Control

Mission Control is a TypeScript workflow runtime built around typed mission definitions.

This repository now ships three workspace packages:

- `@mission-control/core`: the mission DSL, schema helpers, retry metadata, and timer metadata
- `@mission-control/commander`: shared execution contracts, the reusable engine, and a tested `InMemoryCommander`
- `@mission-control/postgres-commander`: the durable Postgres package surface, schema, migrations, serialization, store primitives, and leasing SQL

## What v1 includes

- typed mission definitions
- runtime input validation for `start` and `signal`
- sequential steps
- external waits with `needTo(...)`
- retry policies on steps
- timer waits with `sleep(...)`
- an inspection surface for mission snapshot, history, attempts, signals, and timers
- a solid in-memory commander that acts as the semantic baseline

## What v1 does not include

- workflow versioning for already-running missions
- adapters to Temporal, DBOS, RabbitMQ, or other workflow engines
- visual workflow builders
- browser-first runtime support

## Package layout

```text
packages/
  core/
    src/
      index.ts
      mission-definition.ts
      schema.ts
      errors.ts
      retry-policy.ts
      timer.ts
      types.ts
  commander/
    src/
      index.ts
      contracts.ts
      engine.ts
      errors.ts
      validation.ts
      in-memory/
      testing/
  postgres-commander/
    src/
      index.ts
      commander.ts
      store.ts
      worker.ts
      leasing.ts
      serialization.ts
      migrations/
      sql.ts
```

## Quick start

```ts
import { z } from "zod";
import { m } from "@mission-control/core";
import { InMemoryCommander } from "@mission-control/commander";

const approvalMission = m
	.define("approval")
	.start({
		input: z.strictObject({ email: z.email() }),
		run: async ({ ctx }) => ({ email: ctx.events.start.input.email }),
	})
	.step("send-email", async ({ ctx }) => ({
		sentTo: ctx.events.start.output.email,
	}))
	.needTo("receive-approval", z.strictObject({ approvedBy: z.string() }), {
		timeout: { afterMs: 60_000, action: "fail" },
	})
	.sleep("cooldown", 5_000)
	.end();

const commander = new InMemoryCommander();
const mission = commander.createMission(approvalMission);

await mission.start({ email: "ops@example.com" });
await mission.signal("receive-approval", { approvedBy: "reviewer-1" });
await mission.waitForCompletion();

console.log(mission.inspect());
```

## Validation commands

Run these from the repo root:

```bash
npm run build
npm run check-types
npm run test
```

For the full local release gate:

```bash
npm run release:check
```

## Postgres status

The Postgres package now includes:

- schema DDL
- an initial migration
- serialization helpers
- store/query primitives
- claim/leasing SQL for multi-worker execution

What is still blocked in this environment is live database verification of the durable runtime: mission lifecycle persistence, crash-safe resume, retries, timers, and multi-worker execution against a real Postgres instance.
