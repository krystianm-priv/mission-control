import assert from "node:assert/strict";
import test from "node:test";

import {
	createEngineRuntime,
	type EngineClock,
	hydrateEngineRuntime,
	inspectRuntime,
	MissionExecutionError,
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
	const originalTimeoutAt =
		persisted.snapshot.waiting?.kind === "signal"
			? persisted.snapshot.waiting.timeoutAt
			: undefined;

	await clock.advanceBy(100);
	const recovered = hydrateEngineRuntime(mission, persisted, { clock });
	await recoverRuntime(recovered);

	assert.equal(
		recovered.snapshot.waiting?.kind === "signal"
			? recovered.snapshot.waiting.timeoutAt
			: undefined,
		originalTimeoutAt,
	);
	await clock.advanceBy(400);
	await assert.rejects(() => waitForCompletion(recovered));
	assert.equal(recovered.snapshot.status, "failed");
	assert.equal(recovered.snapshot.error?.at, new Date(500).toISOString());
});

test("recoverRuntime preserves persisted signal waits without deadlines", async () => {
	const mission = m
		.define("signal-recovery")
		.start({
			input: { parse: (input) => input as { id: string } },
			run: async () => ({ ok: true }),
		})
		.needTo("approval", {
			parse: (input) => input as { approvedBy: string },
		})
		.step("finish", async ({ ctx }) => ({
			approvedBy: ctx.events.approval.input.approvedBy,
		}))
		.end();

	const created = createEngineRuntime(mission, "mission-signal-recovery");
	await startRuntime(created, { id: "123" });
	const persisted = inspectRuntime(created);

	const recovered = hydrateEngineRuntime(mission, persisted);
	await recoverRuntime(recovered);
	assert.equal(recovered.snapshot.status, "waiting");
	assert.deepEqual(recovered.snapshot.waiting, persisted.snapshot.waiting);

	await signalRuntime(recovered, "approval", { approvedBy: "ops" });
	const snapshot = await waitForCompletion(recovered);
	assert.equal(snapshot.status, "completed");
	assert.deepEqual(recovered.snapshot.ctx.events["finish"]?.output, {
		approvedBy: "ops",
	});
});

test("recoverRuntime rejects waiting status without waiting metadata", async () => {
	const mission = m
		.define("broken-waiting-status")
		.start({
			input: { parse: (input) => input as { id: string } },
			run: async () => ({ ok: true }),
		})
		.needTo("approval", {
			parse: (input) => input as { approved: boolean },
		})
		.end();

	const runtime = hydrateEngineRuntime(mission, {
		snapshot: {
			missionId: "mission-broken-status",
			missionName: mission.missionName,
			status: "waiting",
			cursor: 1,
			error: undefined,
			ctx: {
				missionId: "mission-broken-status",
				events: { start: { input: { id: "123" }, output: { ok: true } } },
			},
			waiting: undefined,
		},
		history: [],
		stepAttempts: [],
		signals: [],
		timers: [],
	});

	await assert.rejects(() => recoverRuntime(runtime), MissionExecutionError);
});

test("recoverRuntime rejects waiting metadata with a non-waiting status", async () => {
	const mission = m
		.define("broken-waiting-metadata")
		.start({
			input: { parse: (input) => input as { id: string } },
			run: async () => ({ ok: true }),
		})
		.needTo("approval", {
			parse: (input) => input as { approved: boolean },
		})
		.end();

	const runtime = hydrateEngineRuntime(mission, {
		snapshot: {
			missionId: "mission-broken-metadata",
			missionName: mission.missionName,
			status: "running",
			cursor: 1,
			error: undefined,
			ctx: {
				missionId: "mission-broken-metadata",
				events: { start: { input: { id: "123" }, output: { ok: true } } },
			},
			waiting: {
				kind: "signal",
				eventName: "approval",
				nodeIndex: 1,
			},
		},
		history: [],
		stepAttempts: [],
		signals: [],
		timers: [],
	});

	await assert.rejects(() => recoverRuntime(runtime), MissionExecutionError);
});

test("recoverRuntime resumes persisted sleep timers with durable timer state", async () => {
	const clock = new FakeClock();
	const mission = m
		.define("timer-recovery")
		.start({
			input: { parse: (input) => input as { id: string } },
			run: async () => ({ ok: true }),
		})
		.sleep("pause", 500)
		.step("finish", async () => ({ ok: true }))
		.end();

	const created = createEngineRuntime(mission, "mission-timer-recovery", {
		clock,
	});
	await startRuntime(created, { id: "123" });
	const persisted = inspectRuntime(created);

	assert.equal(persisted.snapshot.waiting?.kind, "timer");
	assert.equal(persisted.timers.at(-1)?.status, "scheduled");
	assert.ok(persisted.snapshot.waiting?.timerDueAt);

	await clock.advanceBy(100);
	const recovered = hydrateEngineRuntime(mission, persisted, { clock });
	await recoverRuntime(recovered);
	await clock.advanceBy(400);

	const snapshot = await waitForCompletion(recovered);
	assert.equal(snapshot.status, "completed");
	assert.equal(recovered.timers.at(-1)?.status, "completed");
	assert.equal(
		(
			recovered.snapshot.ctx.events["pause"]?.output as
				| { resumedAt?: string }
				| undefined
		)?.resumedAt,
		new Date(500).toISOString(),
	);
});

test("recoverRuntime rejects persisted timer waits without due times", async () => {
	const mission = m
		.define("broken-timer-wait")
		.start({
			input: { parse: (input) => input as { id: string } },
			run: async () => ({ ok: true }),
		})
		.sleep("pause", 500)
		.end();

	const runtime = hydrateEngineRuntime(mission, {
		snapshot: {
			missionId: "mission-broken-timer",
			missionName: mission.missionName,
			status: "waiting",
			cursor: 1,
			error: undefined,
			ctx: {
				missionId: "mission-broken-timer",
				events: { start: { input: { id: "123" }, output: { ok: true } } },
			},
			waiting: {
				kind: "timer",
				eventName: "pause",
				nodeIndex: 1,
				timerDueAt: "" as unknown as string,
			},
		},
		history: [],
		stepAttempts: [],
		signals: [],
		timers: [],
	});

	runtime.snapshot.waiting = {
		kind: "timer",
		eventName: "pause",
		nodeIndex: 1,
	} as unknown as typeof runtime.snapshot.waiting;

	await assert.rejects(() => recoverRuntime(runtime), MissionExecutionError);
});

test("recoverRuntime resumes persisted retry backoff with durable attempt state", async () => {
	const clock = new FakeClock();
	let attempts = 0;
	const mission = m
		.define("retry-recovery")
		.start({
			input: { parse: (input) => input as { id: string } },
			run: async () => ({ ok: true }),
		})
		.step(
			"unstable",
			async () => {
				attempts += 1;
				if (attempts === 1) {
					throw new Error("transient");
				}
				return { ok: true };
			},
			{ retry: { maxAttempts: 2, initialIntervalMs: 500 } },
		)
		.end();

	const created = createEngineRuntime(mission, "mission-retry-recovery", {
		clock,
	});
	await startRuntime(created, { id: "123" });
	const persisted = inspectRuntime(created);

	assert.equal(persisted.snapshot.waiting?.kind, "retry");
	assert.equal(persisted.stepAttempts.length, 1);
	assert.equal(persisted.stepAttempts[0]?.status, "failed");
	assert.equal(persisted.timers.at(-1)?.kind, "retry");
	assert.equal(persisted.timers.at(-1)?.status, "scheduled");

	await clock.advanceBy(100);
	const recovered = hydrateEngineRuntime(mission, persisted, { clock });
	await recoverRuntime(recovered);
	await clock.advanceBy(400);

	const snapshot = await waitForCompletion(recovered);
	assert.equal(snapshot.status, "completed");
	assert.equal(recovered.stepAttempts.length, 2);
	assert.equal(recovered.stepAttempts[1]?.status, "succeeded");
	assert.equal(recovered.timers.at(-1)?.status, "completed");
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
	assert.equal(runtime.snapshot.error?.at, new Date(10).toISOString());
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

test("side effects can run before persistence failure is recorded", async () => {
	let externalSideEffectCount = 0;
	let persistCalls = 0;

	const mission = m
		.define("at-least-once-boundary")
		.start({
			input: { parse: (input) => input as { id: string } },
			run: async () => ({ ok: true }),
		})
		.step("perform-side-effect", async () => {
			externalSideEffectCount += 1;
			return { persisted: false };
		})
		.end();

	const runtime = createEngineRuntime(mission, "mission-at-least-once", {
		persist: async () => {
			persistCalls += 1;
			if (persistCalls >= 5) {
				throw new Error("persist failed after side effect");
			}
		},
	});

	await assert.rejects(() => startRuntime(runtime, { id: "123" }));
	assert.equal(externalSideEffectCount, 1);
	assert.equal(runtime.snapshot.status, "failed");
	assert.match(runtime.snapshot.error?.message ?? "", /persist failed/);
});
