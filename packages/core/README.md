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
