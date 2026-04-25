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

	await runtime.stop();
});

test("runtime polls claimable adapter tasks and emits hooks", async () => {
	const completed: string[] = [];
	const logs: string[] = [];
	const metrics: string[] = [];
	const mission = m
		.define("runtime-claim")
		.start({
			input: { parse: (input) => input as { id: string } },
			run: async ({ ctx }) => ({ id: ctx.events.start.input.id }),
		})
		.end();

	const runtime = createCommanderRuntime({
		definitions: [mission],
		identity: "worker-a",
		pollIntervalMs: 10_000,
		batchSize: 1,
		leaseTimeoutMs: 1000,
		adapter: {
			saveInspection: () => {},
			loadInspection: () => undefined,
			listWaitingSnapshots: () => [],
			listScheduledSnapshots: () => [],
			listRecoverableInspections: () => [],
			claimRuntimeTasks: () => [
				{
					taskId: "task-1",
					missionId: "missing",
					taskKind: "recover",
				},
			],
			completeRuntimeTask: (taskId) => {
				completed.push(taskId);
			},
			releaseRuntimeClaims: (owner) => {
				logs.push(`release:${owner}`);
			},
		},
		logger: (event) => {
			logs.push(event.event);
		},
		metrics: (event) => {
			metrics.push(event.name);
		},
	});

	await runtime.start();
	await runtime.stop();

	assert.equal(runtime.identity, "worker-a");
	assert.equal(runtime.batchSize, 1);
	assert.deepEqual(completed, ["task-1"]);
	assert.equal(logs.includes("task-claimed"), true);
	assert.equal(logs.includes("runtime-stopped"), true);
	assert.equal(metrics.includes("runtime.task.completed"), true);
});
