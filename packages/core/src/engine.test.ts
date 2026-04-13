import assert from "node:assert/strict";
import test from "node:test";

import {
	createEngineRuntime,
	type EngineClock,
	hydrateEngineRuntime,
	inspectRuntime,
	MissionValidationError,
	m,
	recoverRuntime,
	signalRuntime,
	startRuntime,
	waitForCompletion,
} from "./index.ts";

class FakeClock implements EngineClock {
	private nowMs = 0;
	private readonly tasks: Array<{ dueAt: number; resolve: () => void }> = [];

	public now(): Date {
		return new Date(this.nowMs);
	}

	public sleep(ms: number): Promise<void> {
		return new Promise((resolve) => {
			this.tasks.push({ dueAt: this.nowMs + ms, resolve });
		});
	}

	public async advanceBy(ms: number): Promise<void> {
		this.nowMs += ms;
		const ready = this.tasks.filter((task) => task.dueAt <= this.nowMs);
		this.tasks.splice(
			0,
			this.tasks.length,
			...this.tasks.filter((task) => task.dueAt > this.nowMs),
		);
		for (const task of ready) {
			task.resolve();
			await Promise.resolve();
		}
	}
}

test("recoverRuntime resumes missions persisted in running state", async () => {
	const mission = m
		.define("resume-running")
		.start({
			input: { parse: (input) => input as { id: string } },
			run: async ({ ctx }) => ({ id: ctx.events.start.input.id }),
		})
		.step("finish", async ({ ctx }) => ({ id: ctx.events.start.output.id }))
		.end();

	const runtime = hydrateEngineRuntime(mission, {
		snapshot: {
			missionId: "mission-running",
			missionName: mission.missionName,
			status: "running",
			cursor: 1,
			error: undefined,
			ctx: {
				missionId: "mission-running",
				events: {
					start: {
						input: { id: "123" },
						output: { id: "123" },
					},
				},
			},
			waiting: undefined,
		},
		history: [],
		stepAttempts: [],
		signals: [],
		timers: [],
	});

	await recoverRuntime(runtime);
	const snapshot = await waitForCompletion(runtime);
	assert.equal(snapshot.status, "completed");
	assert.deepEqual(runtime.snapshot.ctx.events["finish"]?.output, {
		id: "123",
	});
});

test("recoverRuntime preserves persisted signal timeout deadlines", async () => {
	const clock = new FakeClock();
	const mission = m
		.define("timeout-recovery")
		.start({
			input: { parse: (input) => input as { id: string } },
			run: async () => ({ ok: true }),
		})
		.needTo(
			"approval",
			{ parse: (input) => input as { approved: boolean } },
			{ timeout: { afterMs: 500, action: "fail" } },
		)
		.end();

	const created = createEngineRuntime(mission, "mission-timeout", { clock });
	await startRuntime(created, { id: "123" });
	const persisted = inspectRuntime(created);
	const originalTimeoutAt = persisted.snapshot.waiting?.timeoutAt;

	await clock.advanceBy(100);
	const recovered = hydrateEngineRuntime(mission, persisted, { clock });
	await recoverRuntime(recovered);

	assert.equal(recovered.snapshot.waiting?.timeoutAt, originalTimeoutAt);
	await clock.advanceBy(400);
	await assert.rejects(() => waitForCompletion(recovered));
	assert.equal(recovered.snapshot.status, "failed");
});

test("timer wake-up failures transition the mission to failed", async () => {
	const clock = new FakeClock();
	const mission = m
		.define("timer-failure")
		.start({
			input: { parse: (input) => input as { id: string } },
			run: async () => ({ ok: true }),
		})
		.sleep("pause", 10)
		.step("explode", async () => {
			throw new Error("boom");
		})
		.end();

	const runtime = createEngineRuntime(mission, "mission-timer-failure", {
		clock,
	});
	await startRuntime(runtime, { id: "123" });
	await clock.advanceBy(10);

	await assert.rejects(() => waitForCompletion(runtime));
	assert.equal(runtime.snapshot.status, "failed");
	assert.equal(runtime.snapshot.error?.message, "boom");
});

test("invalid signals leave the mission waiting for corrected input", async () => {
	const mission = m
		.define("signal-validation")
		.start({
			input: { parse: (input) => input as { id: string } },
			run: async () => ({ ok: true }),
		})
		.needTo("approval", {
			parse: (input) => {
				const value = input as { approvedBy?: unknown };
				if (typeof value.approvedBy !== "string") {
					throw new Error("Invalid approvedBy");
				}
				return { approvedBy: value.approvedBy };
			},
		})
		.end();

	const runtime = createEngineRuntime(mission, "mission-signal-validation");
	await startRuntime(runtime, { id: "123" });

	await assert.rejects(
		() => signalRuntime(runtime, "approval", { wrong: true }),
		MissionValidationError,
	);
	assert.equal(runtime.snapshot.status, "waiting");
	assert.equal(runtime.snapshot.waiting?.eventName, "approval");
	assert.equal(runtime.snapshot.error, undefined);
	assert.equal(runtime.signals.length, 0);
});
