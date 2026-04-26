import assert from "node:assert/strict";
import test from "node:test";

import { MissionDefinitionError } from "./errors.ts";
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

test("mission definitions reject update names that collide with mission events", () => {
	assert.throws(
		() =>
			m
				.define("collision")
				.update(
					"start",
					{
						parse: (input) => input as { note: string },
					},
					({ input }) => input.note,
				)
				.start({
					input: {
						parse: (input) => input as { id: string },
					},
					run: async ({ ctx }) => ({ id: ctx.events.start.input.id }),
				})
				.end(),
		MissionDefinitionError,
	);
});

test("mission definitions reject duplicate and conflicting names across metadata and events", () => {
	assert.throws(
		() =>
			m
				.define("query-duplicate")
				.query("status", () => "ok")
				.query("status", () => "again"),
		MissionDefinitionError,
	);

	assert.throws(
		() =>
			m
				.define("query-step-collision")
				.query("archive", () => "ok")
				.start({
					input: { parse: (input) => input as { id: string } },
					run: async ({ ctx }) => ({ id: ctx.events.start.input.id }),
				})
				.step("archive", async () => ({ ok: true })),
		MissionDefinitionError,
	);

	assert.throws(
		() =>
			m
				.define("schedule-update-collision")
				.schedule("nightly", { cron: "0 0 * * *" })
				.update(
					"nightly",
					{ parse: (input) => input as { id: string } },
					({ input }) => input.id,
				),
		MissionDefinitionError,
	);

	assert.throws(
		() => m.define("start-collision").query("start", () => "bad"),
		MissionDefinitionError,
	);
});

test("mission definitions validate schedules, retry policies, and timeouts", () => {
	assert.throws(
		() => m.define("empty-schedule").schedule("bad", {}),
		MissionDefinitionError,
	);
	assert.throws(
		() =>
			m
				.define("ambiguous-schedule")
				.schedule("bad", { cron: "0 0 * * *", every: "1h" }),
		MissionDefinitionError,
	);
	assert.throws(
		() =>
			m
				.define("duplicate-schedule")
				.schedule("nightly", { cron: "0 0 * * *" })
				.schedule("nightly", { every: "1h" }),
		MissionDefinitionError,
	);

	assert.throws(() =>
		m
			.define("bad-retry")
			.start({
				input: { parse: (input) => input as { id: string } },
				run: async ({ ctx }) => ({ id: ctx.events.start.input.id }),
			})
			.step("work", async () => ({ ok: true }), {
				retry: { maxAttempts: 0 },
			}),
	);
	assert.throws(() =>
		m
			.define("bad-retry-delay")
			.start({
				input: { parse: (input) => input as { id: string } },
				run: async ({ ctx }) => ({ id: ctx.events.start.input.id }),
			})
			.step("work", async () => ({ ok: true }), {
				retry: { initialIntervalMs: Number.NaN },
			}),
	);
	assert.throws(
		() =>
			m
				.define("bad-timeout")
				.start({
					input: { parse: (input) => input as { id: string } },
					run: async ({ ctx }) => ({ id: ctx.events.start.input.id }),
				})
				.needTo(
					"approve",
					{ parse: (input) => input as { approvedBy: string } },
					{ timeout: { afterMs: -1, action: "fail" } },
				),
		MissionDefinitionError,
	);
});
