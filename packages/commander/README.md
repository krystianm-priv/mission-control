# commander

The commander package provides a **runtime** for mission definitions.

This package currently ships a lightweight **in-memory commander** intended for examples and local runs.

## Example

```ts
import { inMemoryCommander } from "@mission-control/commander";
import { askForReviewMission } from "./mission-definition.ts";

const mission = inMemoryCommander.createMission(askForReviewMission);

await mission.startMission({ email: "hello@world.com" });
await mission.signal("receive-review", "Great job!");
```
