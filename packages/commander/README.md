# @mission-control/commander

`@mission-control/commander` defines the shared runtime contracts, the reusable execution engine, and the reference `InMemoryCommander`.

## Public surface

- `InMemoryCommander`
- `inMemoryCommander`
- runtime contracts: `MissionSnapshot`, `MissionInspection`, `MissionHistoryRecord`, `StepAttemptRecord`, `SignalRecord`, `TimerRecord`
- engine utilities: `createEngineRuntime`, `startRuntime`, `signalRuntime`, `runUntilWaitOrEnd`
- test helper: `FakeClock`

## Semantics

- `idle`: created, not yet started
- `running`: currently interpreting steps
- `waiting`: paused on a signal or timer
- `completed`: reached the terminal `end()`
- `failed`: reached a terminal error state

## Example

```ts
import { InMemoryCommander } from "@mission-control/commander";
import { approvalMission } from "./approval-mission.js";

const commander = new InMemoryCommander();
const mission = commander.createMission(approvalMission);

await mission.start({ email: "hello@example.com" });
await mission.signal("receive-approval", { approvedBy: "ops" });

console.log(mission.inspect());
```
