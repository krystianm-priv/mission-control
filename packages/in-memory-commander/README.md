# @mission-control/in-memory-commander

`@mission-control/in-memory-commander` provides the in-memory runtime implementation for Mission Control.

## Public surface

- `InMemoryCommander`
- `FakeClock`

There is no singleton commander instance in the public API. Create runtimes explicitly with `new InMemoryCommander(...)`.

## Example

```ts
import { InMemoryCommander } from "@mission-control/in-memory-commander";
import { approvalMission } from "./approval-mission.ts";

const commander = new InMemoryCommander({
	definitions: [approvalMission],
});

const mission = commander.createMission(approvalMission);
await mission.start({ email: "hello@example.com" });
await mission.signal("receive-approval", { approvedBy: "ops" });
```
