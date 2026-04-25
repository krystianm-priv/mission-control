# @mission-control/testing

`@mission-control/testing` contains reusable test helpers for Mission Control packages and applications.

## Exports

- `FakeClock`: deterministic `EngineClock` implementation with `advanceBy(ms)`.
- `createDeferred<T>()`: deferred promise helper for race and ordering tests.

## Example

```ts
import test from "node:test";
import assert from "node:assert/strict";

import { FakeClock } from "@mission-control/testing";

test("deterministic timer tests", async () => {
	const clock = new FakeClock();
	let fired = false;

	void clock.sleep(100).then(() => {
		fired = true;
	});

	await clock.advanceBy(100);
	assert.equal(fired, true);
});
```
