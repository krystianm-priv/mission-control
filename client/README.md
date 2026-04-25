# @mission-control/client

`@mission-control/client` provides mission-native helpers for starting missions and interacting with mission handles through a runtime-owned commander.

## Exports

- `createCommanderClient(...)`
- `CommanderClient`
- `CommanderClientHandle`

## Example

```ts
import { createCommanderClient } from "@mission-control/client";
import { createCommanderRuntime } from "@mission-control/runtime";

const runtime = createCommanderRuntime({
	definitions: [approvalMission],
});
await runtime.start();

const client = createCommanderClient({ runtime });
const mission = await client.startMission(approvalMission, {
	email: "ops@example.com",
});

await mission.signal("receive-approval", { approvedBy: "reviewer-1" });
const result = await mission.result();
console.log(result.status);
```

Use this package when application code should interact with missions through a runtime boundary instead of using the commander directly.
