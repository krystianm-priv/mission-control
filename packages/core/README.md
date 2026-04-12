# @mission-control/core

`@mission-control/core` contains the runtime-neutral public architecture for Mission Control.

## Public surface

- `m.define(...).start(...).step(...).needTo(...).sleep(...).end()`
- schema helpers: `Schema`, `AnyInputSchema`, `InferInput`, `parseMissionInput`
- retry helpers: `DEFAULT_RETRY_POLICY`, `normalizeRetryPolicy`, `getRetryDelayMs`
- timer helpers: `NeedToOptions`, `WaitTimeoutDefinition`, `SleepResult`
- commander contracts: `MissionSnapshot`, `MissionInspection`, `MissionHistoryRecord`, `StepAttemptRecord`, `SignalRecord`, `TimerRecord`
- runtime engine helpers: `createEngineRuntime`, `hydrateEngineRuntime`, `recoverRuntime`, `startRuntime`, `signalRuntime`, `runUntilWaitOrEnd`
- abstract base class: `Commander`

## Example

```ts
import { z } from "zod";
import { Commander, m } from "@mission-control/core";

const reminderMission = m
	.define("reminder")
	.start({
		input: z.strictObject({ userId: z.string() }),
		run: async ({ ctx }) => ({ userId: ctx.events.start.input.userId }),
	})
	.sleep("wait-before-reminder", 30_000)
	.end();

abstract class AppCommander extends Commander {}

void reminderMission;
void AppCommander;
```
