import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createCommander, type EngineClock, m } from "@mission-control/core";

import { createPgPersistenceAdapter, PgCommander } from "./commander.ts";

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

async function createPGliteHarness(): Promise<
	| {
			createExecute: () => Promise<(query: string) => Promise<unknown>>;
			cleanup: () => Promise<void>;
	  }
	| undefined
> {
	try {
		const mod = await import("@electric-sql/pglite");
		const dir = mkdtempSync(join(tmpdir(), "mission-control-pg-commander-"));
		const path = join(dir, "pgdata");
		const openDbs: Array<{ close(): Promise<void> }> = [];
		return {
			createExecute: async () => {
				const db = await mod.PGlite.create(path);
				openDbs.push(db);
				return (query: string) => db.exec(query);
			},
			cleanup: async () => {
				for (const db of openDbs.splice(0)) {
					await db.close();
				}
				rmSync(dir, { recursive: true, force: true });
			},
		};
	} catch {
		return undefined;
	}
}

test("PgCommander survives reload for waiting signal missions", async () => {
	const harness = await createPGliteHarness();
	if (!harness) {
		return;
	}

	try {
		const mission = m
			.define("approval")
			.start({
				input: {
					parse: (input: unknown) => {
						const value = input as { email?: unknown };

						if (typeof value.email !== "string" || !value.email.includes("@")) {
							throw new Error("Invalid email");
						}

						return { email: value.email };
					},
				},
				run: async ({ ctx }) => ({ email: ctx.events.start.input.email }),
			})
			.needTo("receive-approval", {
				parse: (input: unknown) => {
					const value = input as { approvedBy?: unknown };

					if (typeof value.approvedBy !== "string") {
						throw new Error("Invalid approvedBy");
					}

					return { approvedBy: value.approvedBy };
				},
			})
			.step("archive", async ({ ctx }) => ({
				approvedBy: ctx.events["receive-approval"].input.approvedBy,
			}))
			.end();

		const commander1 = createCommander({
			definitions: [mission],
			createMissionId: () => "mission-signal",
			persistence: createPgPersistenceAdapter({
				execute: await harness.createExecute(),
			}),
		});
		await commander1.start(mission, {
			email: "hello@example.com",
		});
		commander1.close();

		const commander2 = createCommander({
			definitions: [mission],
			persistence: createPgPersistenceAdapter({
				execute: await harness.createExecute(),
			}),
		});
		await commander2.waitUntilReady();
		const waiting = await commander2.listWaiting();
		assert.equal(waiting.length, 1);
		assert.equal(waiting[0]?.missionId, "mission-signal");
		assert.equal(waiting[0]?.waiting?.kind, "signal");
		const loaded =
			await commander2.getMission<typeof mission>("mission-signal");
		assert.ok(loaded);
		await loaded.signal("receive-approval", { approvedBy: "ops" });
		await loaded.waitForCompletion();
		assert.equal(loaded.inspect().snapshot.status, "completed");
		commander2.close();
	} finally {
		await harness.cleanup();
	}
});

test("PgCommander resumes sleep timers after reload", async () => {
	const harness = await createPGliteHarness();
	if (!harness) {
		return;
	}

	const clock = new FakeClock();
	try {
		const mission = m
			.define("reminder")
			.start({
				input: {
					parse: (input: unknown) => {
						const value = input as { id?: unknown };

						if (typeof value.id !== "string") {
							throw new Error("Invalid id");
						}

						return { id: value.id };
					},
				},
				run: async ({ ctx }) => ({ id: ctx.events.start.input.id }),
			})
			.sleep("pause", 1000)
			.step("finish", async () => ({ ok: true }))
			.end();

		const commander1 = new PgCommander({
			execute: await harness.createExecute(),
			definitions: [mission],
			clock,
			createMissionId: () => "mission-timer",
		});
		const created = commander1.createMission(mission);
		await created.start({ id: "123" });
		commander1.close();

		const commander2 = new PgCommander({
			execute: await harness.createExecute(),
			definitions: [mission],
			clock,
		});
		await commander2.waitUntilReady();
		const scheduled = await commander2.listScheduled();
		assert.equal(scheduled.length, 1);
		const scheduledTimer = scheduled[0];
		assert.ok(scheduledTimer);
		assert.ok(scheduledTimer.waiting);
		assert.equal(scheduledTimer.missionId, "mission-timer");
		assert.equal(scheduledTimer.waiting.kind, "timer");
		const loaded = await commander2.getMission<typeof mission>("mission-timer");
		assert.ok(loaded);
		await clock.advanceBy(1000);
		await loaded.waitForCompletion();
		assert.equal(loaded.inspect().snapshot.status, "completed");
		commander2.close();
	} finally {
		await harness.cleanup();
	}
});

test("PgCommander resumes retry backoff after reload", async () => {
	const harness = await createPGliteHarness();
	if (!harness) {
		return;
	}

	const clock = new FakeClock();
	let attempts = 0;
	try {
		const mission = m
			.define("retry-durable")
			.start({
				input: {
					parse: (input: unknown) => {
						const value = input as { id?: unknown };

						if (typeof value.id !== "string") {
							throw new Error("Invalid id");
						}

						return { id: value.id };
					},
				},
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
				{ retry: { maxAttempts: 2, initialIntervalMs: 1000 } },
			)
			.end();

		const commander1 = new PgCommander({
			execute: await harness.createExecute(),
			definitions: [mission],
			clock,
			createMissionId: () => "mission-retry",
		});
		const created = commander1.createMission(mission);
		await created.start({ id: "123" });
		assert.equal(created.status, "waiting");
		commander1.close();

		const commander2 = new PgCommander({
			execute: await harness.createExecute(),
			definitions: [mission],
			clock,
		});
		await commander2.waitUntilReady();
		const scheduled = await commander2.listScheduled();
		assert.equal(scheduled.length, 1);
		const scheduledRetry = scheduled[0];
		assert.ok(scheduledRetry);
		assert.ok(scheduledRetry.waiting);
		assert.equal(scheduledRetry.missionId, "mission-retry");
		assert.equal(scheduledRetry.waiting.kind, "retry");
		const loaded = await commander2.getMission<typeof mission>("mission-retry");
		assert.ok(loaded);
		await clock.advanceBy(1000);
		await loaded.waitForCompletion();
		assert.equal(loaded.inspect().snapshot.status, "completed");
		commander2.close();
	} finally {
		await harness.cleanup();
	}
});

test("PgCommander rejects createMission after close", async () => {
	const harness = await createPGliteHarness();
	if (!harness) {
		return;
	}

	try {
		const mission = m
			.define("closed")
			.start({
				input: { parse: (input: unknown) => input as { id: string } },
				run: async () => ({ ok: true }),
			})
			.end();

		const commander = new PgCommander({
			execute: await harness.createExecute(),
			definitions: [mission],
		});
		commander.close();

		assert.throws(() => commander.createMission(mission), /error:|closed/i);
	} finally {
		await harness.cleanup();
	}
});
