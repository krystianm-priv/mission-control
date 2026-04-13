import assert from "node:assert/strict";
import test from "node:test";

import { m } from "@mission-control/core";

import { createCommanderRuntime } from "./index.ts";

test("runtime starts and stops an embedded commander", async () => {
	const mission = m
		.define("runtime-demo")
		.start({
			input: {
				parse: (input) => input as { id: string },
			},
			run: async ({ ctx }) => ({ id: ctx.events.start.input.id }),
		})
		.end();

	const runtime = createCommanderRuntime({
		definitions: [mission],
		createMissionId: () => "runtime-1",
		identity: "worker-a",
		taskQueue: "default",
	});

	await runtime.start();
	const handle = await runtime.commander.start(mission, { id: "123" });

	assert.equal(runtime.identity, "worker-a");
	assert.equal(runtime.taskQueue, "default");
	assert.equal(handle.status, "completed");

	runtime.stop();
});
