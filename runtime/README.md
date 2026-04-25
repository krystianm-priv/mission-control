# @mission-control/runtime

`@mission-control/runtime` provides the managed embedded runtime around the core commander API.

It preserves Mission Control's mission terminology and DSL while giving applications a runtime boundary for startup, polling, task claims, shutdown, logs, and metrics.

```ts
import { createCommanderRuntime } from "@mission-control/runtime";
import { createPgPersistenceAdapter } from "@mission-control/adapter-postgres";

const runtime = createCommanderRuntime({
	adapter: createPgPersistenceAdapter({ execute }),
	definitions: [reminderMission],
	identity: "api-worker-1",
	pollIntervalMs: 500,
	batchSize: 10,
	leaseTimeoutMs: 30_000,
	logger: (event) => console.log(event),
	metrics: (event) => metrics.record(event.name, event.value, event.tags),
});

await runtime.start();
```

`stop()` halts polling, wakes the runtime loop, releases claims owned by the runtime identity, closes the commander, and then resolves.
