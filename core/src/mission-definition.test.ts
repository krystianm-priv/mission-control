import assert from "node:assert/strict";
import test from "node:test";

import { m } from "./mission-definition.ts";

test("mission definitions preserve additive query, update, and schedule metadata", () => {
	const mission = m
		.define("approval")
		.query("status", ({ ctx }) => ctx.events["start"]?.input)
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
			({ input }) => ({ accepted: input.note }),
		)
		.schedule("nightly", {
			cron: "0 0 * * *",
			overlapPolicy: "skip",
		})
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

	const staticDefinition = mission.toStatic();

	assert.deepEqual(
		staticDefinition.queries.map(({ name }) => name),
		["status"],
	);
	assert.deepEqual(
		staticDefinition.updates.map(({ name }) => name),
		["attach-note"],
	);
	assert.deepEqual(staticDefinition.schedules, [
		{
			name: "nightly",
			cron: "0 0 * * *",
			overlapPolicy: "skip",
		},
	]);
	assert.equal(mission.queries[0]?.name, "status");
	assert.equal(mission.updates[0]?.name, "attach-note");
	assert.equal(mission.schedules[0]?.name, "nightly");
});
