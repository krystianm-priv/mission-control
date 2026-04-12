# @mission-control/core

`@mission-control/core` contains the public mission definition DSL and the shared type/runtime validation layer.

## Public surface

- `m.define(...).start(...).step(...).needTo(...).sleep(...).end()`
- schema helpers: `Schema`, `AnyInputSchema`, `InferInput`, `parseMissionInput`
- error types: `MissionValidationError`, `MissionDefinitionError`
- retry helpers: `DEFAULT_RETRY_POLICY`, `normalizeRetryPolicy`, `getRetryDelayMs`
- timer metadata: `NeedToOptions`, `WaitTimeoutDefinition`, `SleepResult`

## Example

```ts
import { z } from "zod";
import { m } from "@mission-control/core";

export const reminderMission = m
	.define("reminder")
	.start({
		input: z.strictObject({ userId: z.string() }),
		run: async ({ ctx }) => ({ userId: ctx.events.start.input.userId }),
	})
	.sleep("wait-before-reminder", 30_000)
	.needTo("acknowledge", z.strictObject({ acknowledged: z.boolean() }), {
		timeout: { afterMs: 60_000, action: "fail" },
	})
	.end();
```
