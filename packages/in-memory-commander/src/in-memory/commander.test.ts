import assert from "node:assert/strict";
import test from "node:test";
import {
	MissionSignalError,
	MissionValidationError,
	m,
} from "@mission-control/core";
import { z } from "zod/v4";
import { FakeClock } from "../testing/fixtures.ts";
import { InMemoryCommander } from "./commander.ts";

test("in-memory commander runs successful start, wait, signal, and completion flow", async () => {
	const mission = m
		.define("approval-flow")
		.start({
			input: z.strictObject({ email: z.email() }),
			run: async ({ ctx }) => ({
				normalizedEmail: ctx.events.start.input.email,
			}),
		})
		.step("send-email", async ({ ctx }) => ({
			sentTo: ctx.events.start.output.normalizedEmail,
		}))
		.needTo("receive-approval", z.strictObject({ approvedBy: z.string() }))
		.step("archive", async ({ ctx }) => ({
			approvedBy: ctx.events["receive-approval"].input.approvedBy,
		}))
		.end();

	const commander = new InMemoryCommander({
		createMissionId: () => "mission-1",
	});
	const handle = commander.createMission(mission);

	await handle.start({ email: "hello@example.com" });
	assert.equal(handle.status, "waiting");
	assert.equal((await commander.listWaiting()).length, 1);

	await handle.signal("receive-approval", { approvedBy: "ops" });
	assert.equal(handle.status, "completed");

	const inspection = handle.inspect();
	assert.equal(
		(inspection.snapshot.ctx.events.archive?.output as { approvedBy: string })
			.approvedBy,
		"ops",
	);
	assert.equal(
		inspection.history.some((record) => record.type === "signal-received"),
		true,
	);
});

test("invalid start input fails fast with MissionValidationError", async () => {
	const mission = m
		.define("validation")
		.start({
			input: z.strictObject({ email: z.email() }),
			run: async () => ({ ok: true }),
		})
		.end();

	const commander = new InMemoryCommander({
		createMissionId: () => "mission-2",
	});
	const handle = commander.createMission(mission);

	await assert.rejects(
		() => handle.start({ email: "nope" }),
		MissionValidationError,
	);
	assert.equal(handle.status, "failed");
});

test("wrong signal name fails clearly", async () => {
	const mission = m
		.define("wrong-signal")
		.start({
			input: z.object({ id: z.string() }),
			run: async () => ({ ok: true }),
		})
		.needTo("expected", z.object({ value: z.string() }))
		.end();

	const commander = new InMemoryCommander({
		createMissionId: () => "mission-3",
	});
	const handle = commander.createMission(mission);

	await handle.start({ id: "123" });
	await assert.rejects(
		() => handle.signal("expected" as never, { wrong: true } as never),
		MissionValidationError,
	);
	await assert.rejects(
		() => handle.signal("unexpected" as never, { value: "x" } as never),
		MissionSignalError,
	);
});

test("step retry policy retries before succeeding", async () => {
	let calls = 0;
	const mission = m
		.define("retry")
		.start({
			input: z.object({ id: z.string() }),
			run: async () => ({ ok: true }),
		})
		.step(
			"unstable",
			async () => {
				calls += 1;
				if (calls < 3) {
					throw new Error("transient");
				}
				return { ok: true };
			},
			{ retry: { maxAttempts: 3, initialIntervalMs: 0 } },
		)
		.end();

	const commander = new InMemoryCommander({
		createMissionId: () => "mission-4",
	});
	const handle = commander.createMission(mission);

	await handle.start({ id: "123" });
	assert.equal(handle.status, "completed");
	assert.equal(
		handle
			.inspect()
			.stepAttempts.filter((attempt) => attempt.stepName === "unstable").length,
		3,
	);
});

test("sleep nodes schedule automatic timer wakeups", async () => {
	const clock = new FakeClock();
	const mission = m
		.define("timer")
		.start({
			input: z.object({ id: z.string() }),
			run: async () => ({ ok: true }),
		})
		.sleep("delay", 1000)
		.step("after-delay", async ({ ctx }) => ({
			dueAt: ctx.events.delay.output.dueAt,
		}))
		.end();

	const commander = new InMemoryCommander({
		createMissionId: () => "mission-5",
		clock,
	});
	const handle = commander.createMission(mission);

	await handle.start({ id: "123" });
	assert.equal(handle.status, "waiting");
	assert.equal((await commander.listScheduled()).length, 1);

	await clock.advanceBy(1000);
	await handle.waitForCompletion();
	assert.equal(handle.status, "completed");
});

test("needTo timeout fails deterministically", async () => {
	const clock = new FakeClock();
	const mission = m
		.define("timeout")
		.start({
			input: z.object({ id: z.string() }),
			run: async () => ({ ok: true }),
		})
		.needTo("approval", z.object({ approved: z.boolean() }), {
			timeout: { afterMs: 500, action: "fail" },
		})
		.end();

	const commander = new InMemoryCommander({
		createMissionId: () => "mission-6",
		clock,
	});
	const handle = commander.createMission(mission);

	await handle.start({ id: "123" });
	await clock.advanceBy(500);
	await assert.rejects(() => handle.waitForCompletion());
	assert.equal(handle.status, "failed");
});

test("inspection APIs expose history, signals, timers, and context accumulation", async () => {
	const clock = new FakeClock();
	const mission = m
		.define("inspect")
		.start({
			input: z.object({ id: z.string() }),
			run: async ({ ctx }) => ({ id: ctx.events.start.input.id }),
		})
		.sleep("pause", 10)
		.needTo("resume", z.object({ value: z.string() }))
		.step("finish", async ({ ctx }) => ({
			value: ctx.events.resume.input.value,
		}))
		.end();

	const commander = new InMemoryCommander({
		createMissionId: () => "mission-7",
		clock,
	});
	const handle = commander.createMission(mission);

	await handle.start({ id: "123" });
	await clock.advanceBy(10);
	for (
		let attempt = 0;
		attempt < 5 && handle.inspect().snapshot.waiting?.kind !== "signal";
		attempt += 1
	) {
		await Promise.resolve();
	}
	assert.equal(handle.inspect().snapshot.waiting?.kind, "signal");
	await handle.signal("resume", { value: "done" });

	const inspection = await commander.loadMission("mission-7");
	assert.ok(inspection);
	assert.equal(inspection.snapshot.status, "completed");
	assert.equal(inspection.timers.length, 1);
	assert.equal(inspection.signals.length, 1);
	assert.equal(
		(inspection.snapshot.ctx.events.finish?.output as { value: string }).value,
		"done",
	);
});
