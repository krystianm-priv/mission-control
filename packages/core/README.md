# @mission-control/core

`@mission-control/core` contains the runtime-neutral public architecture for Mission Control.

## Public surface

- `m.define(...).start(...).step(...).needTo(...).sleep(...).end()`
- schema helpers: `Schema`, `AnyInputSchema`, `Infer`, `parseMissionInput`
- retry helpers: `DEFAULT_RETRY_POLICY`, `normalizeRetryPolicy`, `getRetryDelayMs`
- timer helpers: `NeedToOptions`, `WaitTimeoutDefinition`, `SleepResult`
- commander contracts: `MissionSnapshot`, `MissionInspection`, `MissionHistoryRecord`, `StepAttemptRecord`, `SignalRecord`, `TimerRecord`
- configurable runtime APIs: `createCommander`, `ConfigurableCommander`, `CommanderPersistenceAdapter`
- runtime engine helpers: `createEngineRuntime`, `hydrateEngineRuntime`, `recoverRuntime`, `startRuntime`, `signalRuntime`, `runUntilWaitOrEnd`
- abstract base class: `Commander`

## Persistence adapter contract

`createCommander(...)` accepts an optional `persistence` object that implements `CommanderPersistenceAdapter`.
If omitted, the commander uses an internal in-memory adapter.

Third-party adapters should treat `MissionInspection` as the minimum durable unit.
That snapshot includes mission state, history, attempts, signals, timers, and waiting metadata, which is the information required for restart-safe recovery.

Expected semantics:

- `bootstrap()` runs once during commander startup before recovery begins
- `saveInspection(inspection)` persists the latest full mission inspection after runtime changes
- `loadInspection(missionId)` returns one stored mission inspection or `undefined`
- `listWaitingSnapshots()` returns waiting missions for inspection APIs
- `listScheduledSnapshots()` returns only waiting timer/retry missions, ordered however the backend considers canonical
- `listRecoverableInspections()` returns missions in `waiting` or `running` states that should be rehydrated on startup
- `close()` is optional synchronous cleanup for backend resources owned by the adapter

The commander does not require a query builder, ORM, queue, or leasing protocol.
For v1, adapters are expected to support single-process recovery semantics that match the existing in-memory and Postgres runtimes.
If an adapter initializes asynchronously, `start(...)` waits for readiness automatically and `waitUntilReady()` is available before calling `createMission(...)` directly.

## Example

```ts
import { createCommander, m } from "@mission-control/core";

const reminderMission = m
	.define("reminder")
	.start({
		input: {
			parse: (input) => {
				const value = input as { userId?: unknown };
				if (typeof value.userId !== "string") {
					throw new Error("Invalid reminder input.");
				}
				return { userId: value.userId };
			},
		},
		run: async ({ ctx }) => ({ userId: ctx.events.start.input.userId }),
	})
	.sleep("wait-before-reminder", 30_000)
	.end();

const commander = createCommander({
	definitions: [reminderMission],
});

const mission = await commander.start(reminderMission, {
	userId: "user-123",
});
await mission.waitForCompletion();
```

## Adapter example

```ts
import {
	type CommanderPersistenceAdapter,
	createCommander,
	type MissionInspection,
	m,
} from "@mission-control/core";

class FileBackedAdapter implements CommanderPersistenceAdapter {
	public bootstrap(): void {}

	public saveInspection(inspection: MissionInspection): void {
		void inspection;
	}

	public loadInspection(): MissionInspection | undefined {
		return undefined;
	}

	public listWaitingSnapshots() {
		return [];
	}

	public listScheduledSnapshots() {
		return [];
	}

	public listRecoverableInspections() {
		return [];
	}
}

const reminderMission = m
	.define("reminder")
	.start({
		input: { parse: (input) => input as { userId: string } },
		run: async ({ ctx }) => ({ userId: ctx.events.start.input.userId }),
	})
	.end();

const commander = createCommander({
	definitions: [reminderMission],
	persistence: new FileBackedAdapter(),
});

await commander.start(reminderMission, { userId: "user-123" });
```
