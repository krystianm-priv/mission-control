# @mission-control/core

`@mission-control/core` contains the runtime-neutral public architecture for Mission Control.

## Public surface

- `m.define(...).start(...).step(...).needTo(...).sleep(...).end()`
- additive definition metadata: `m.define(...).query(...)`, `m.define(...).update(...)`, `m.define(...).schedule(...)`
- schema helpers: `Schema`, `AnyInputSchema`, `Infer`, `parseMissionInput`
- retry helpers: `DEFAULT_RETRY_POLICY`, `normalizeRetryPolicy`, `getRetryDelayMs`
- timer helpers: `NeedToOptions`, `WaitTimeoutDefinition`, `SleepResult`
- commander contracts: `MissionSnapshot`, `MissionInspection`, `MissionFailure`, `SignalWaitingState`, `TimerWaitingState`, `RetryWaitingState`, `WaitingMissionSnapshot`, `ScheduledMissionSnapshot`, `RecoverableMissionInspection`, `MissionHistoryRecord`, `StepAttemptRecord`, `SignalRecord`, `TimerRecord`
- configurable runtime APIs: `createCommander`, `ConfigurableCommander`, `CommanderPersistenceAdapter`, `isWaitingMissionSnapshot`, `isScheduledMissionSnapshot`, `isRecoverableMissionInspection`
- mission handle helpers: `query(...)`, `update(...)`, `result()`
- runtime engine helpers: `createEngineRuntime`, `hydrateEngineRuntime`, `recoverRuntime`, `startRuntime`, `signalRuntime`, `runUntilWaitOrEnd`
- abstract base class: `Commander`

## Persistence adapter contract

`createCommander(...)` accepts an optional `persistence` object that implements `CommanderPersistenceAdapter`.
If omitted, the commander uses an internal in-memory adapter.

Third-party adapters should treat `MissionInspection` as the minimum durable unit.
That snapshot includes mission state, history, attempts, signals, timers, explicit waiting-state variants, and failure metadata, which is the information required for restart-safe recovery.
The exported predicate helpers can be used to narrow persisted rows into the exact waiting, scheduled, and recoverable shapes expected by the adapter contract.

Expected semantics:

- `bootstrap()` runs once during commander startup before recovery begins
- `saveInspection(inspection)` persists the latest full mission inspection after runtime changes
- `loadInspection(missionId)` returns one stored mission inspection or `undefined`
- `listWaitingSnapshots()` returns `WaitingMissionSnapshot[]` for inspection APIs
- `listScheduledSnapshots()` returns `ScheduledMissionSnapshot[]` for waiting timer/retry missions, ordered however the backend considers canonical
- `listRecoverableInspections()` returns `RecoverableMissionInspection[]` for missions in `waiting` or `running` states that should be rehydrated on startup
- recovery should fail fast when persisted `status` and `waiting` metadata disagree, rather than leaving a mission in an ambiguous hung state
- `close()` is optional synchronous cleanup for backend resources owned by the adapter

The commander does not require a query builder, ORM, queue, or leasing protocol.
For the current runtime, adapters are expected to support recovery semantics that match the in-memory runtime. Durable adapters can additionally expose incomplete-mission and start-at listing helpers used by `@mission-control/runtime`.
If an adapter initializes asynchronously, `start(...)` waits for readiness automatically and `waitUntilReady()` is available before calling `createMission(...)` directly.

## Recovery and side effects

The current `core` runtime is explicit about mission-state recovery, not about exactly-once side-effect execution.

What `core` currently models durably:

- start input and any persisted event outputs already recorded in mission context
- waiting state for signals, sleep timers, and retry backoff
- step-attempt history, signal receipts, timer history, and terminal failures

What `core` does not solve by itself:

- deduplicating user-defined side effects across process crashes or reloads
- proving that a step body ran exactly once
- preventing replay when user code performs an external side effect before the next persisted inspection write completes

When documenting or implementing adapters, treat mission recovery as restart-safe for persisted mission state, but treat user code as replayable unless the application adds its own idempotency boundary.

## Additive metadata

`core` now lets mission definitions register additive metadata without changing the authored chain:

- `query(name, run)` for read-only inspection helpers
- `update(name, inputSchema, run)` for durable mutation helpers that persist mission context
- `schedule(name, { cron | every, overlapPolicy? })` for future runtime scheduling metadata

These additions do not yet make Mission Control a full event-sourced multi-worker platform. They are thin foundations that preserve the DSL while the deeper runtime architecture evolves.

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
	type RecoverableMissionInspection,
	type ScheduledMissionSnapshot,
	type WaitingMissionSnapshot,
	m,
} from "@mission-control/core";

class FileBackedAdapter implements CommanderPersistenceAdapter {
	public bootstrap(): void {}

	public saveInspection(inspection: MissionInspection): void {
		void inspection;
	}

	public loadInspection(_missionId: string): MissionInspection | undefined {
		return undefined;
	}

	public listWaitingSnapshots(): WaitingMissionSnapshot[] {
		return [];
	}

	public listScheduledSnapshots(): ScheduledMissionSnapshot[] {
		return [];
	}

	public listRecoverableInspections(): RecoverableMissionInspection[] {
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
