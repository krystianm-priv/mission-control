import assert from "node:assert/strict";
import test from "node:test";

import { m } from "@mission-control/core";
import { createCommanderRuntime } from "@mission-control/runtime";

import { createCommanderClient } from "./index.ts";

test("client starts missions and uses additive query and update handlers", async () => {
	const mission = m
		.define("client-demo")
		.query("current-email", ({ ctx }) => ctx.events["start"]?.input)
		.update(
			"attach-note",
			{
				parse: (input) => {
					const value = input as { note?: unknown };
					if (typeof value.note !== "string") {
						throw new Error("Invalid note.");
					}
					return { note: value.note };
				},
			},
			({ input }) => input.note,
		)
		.start({
			input: {
				parse: (input) => {
					const value = input as { email?: unknown };
					if (typeof value.email !== "string") {
						throw new Error("Invalid email.");
					}
					return { email: value.email };
				},
			},
			run: async ({ ctx }) => {
				const started = ctx.events["start"];
				if (!started || typeof started.input.email !== "string") {
					throw new Error("Mission start event is missing.");
				}
				return { email: started.input.email };
			},
		})
		.needTo("approve", {
			parse: (input) => input as { approvedBy: string },
		})
		.end();

	const runtime = createCommanderRuntime({
		definitions: [mission],
		createMissionId: () => "client-1",
	});
	await runtime.start();

	const client = createCommanderClient({ runtime });
	const handle = await client.startMission(mission, {
		email: "user@example.com",
	});

	assert.deepEqual(await handle.query("current-email"), {
		email: "user@example.com",
	});
	assert.equal(await handle.update("attach-note", { note: "hello" }), "hello");
	assert.equal(
		handle.inspect().snapshot.ctx.events["attach-note"]?.output,
		"hello",
	);

	await handle.signal("approve", { approvedBy: "ops" });
	await handle.result();

	await runtime.stop();
});

test("client exposes operator inspection and cancellation helpers", async () => {
	const mission = m
		.define("client-cancel")
		.start({
			input: { parse: (input) => input as { id: string } },
			run: async ({ ctx }) => ({ id: ctx.events.start.input.id }),
		})
		.needTo("approve", {
			parse: (input) => input as { approvedBy: string },
		})
		.end();
	const runtime = createCommanderRuntime({
		definitions: [mission],
		createMissionId: () => "client-cancel-1",
	});
	await runtime.start();
	const client = createCommanderClient({ runtime });
	await client.startMission(mission, { id: "123" });

	assert.equal((await client.listWaitingMissions()).length, 1);
	assert.ok(await client.inspectMission("client-cancel-1"));
	const snapshot = await client.cancelMission(
		"client-cancel-1",
		"operator cancel",
	);

	assert.equal(snapshot.status, "cancelled");
	await runtime.stop();
});
