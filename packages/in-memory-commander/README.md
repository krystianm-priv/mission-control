# @mission-control/in-memory-commander

`@mission-control/in-memory-commander` provides the in-memory runtime implementation for Mission Control.

## Public surface

- `InMemoryCommander`
- `FakeClock`

The preferred v1 API is `createCommander(...)` from `@mission-control/core`.
`InMemoryCommander` remains as a thin compatibility wrapper around that shared implementation.

## Example

```ts
import { createCommander } from "@mission-control/core";
import { approvalMission } from "./approval-mission.ts";

const commander = createCommander({
	definitions: [approvalMission],
});

const mission = await commander.start(approvalMission, {
	email: "hello@example.com",
});
await mission.signal("receive-approval", { approvedBy: "ops" });
```
