import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { type EngineClock, m } from "@mission-control/core";

import { SQLiteCommander } from "./commander.ts";

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

function createTempDbPath(): { dir: string; path: string } {
	const dir = mkdtempSync(join(tmpdir(), "mission-control-sqlite-commander-"));
	return { dir, path: join(dir, "missions.sqlite") };
}

test("SQLiteCommander survives reload for waiting signal missions", async () => {
	const temp = createTempDbPath();
	try {
		const mission = m
			.define("approval")
			.start({
				input: {
					parse: i => i as { email: string },
				},
				run: async ({ ctx }) => ({ email: ctx.events.start.input.email }),
			})
			.needTo("receive-approval", {
				parse: i => i as { approvedBy: string },
			})
			.step("archive", async ({ ctx }) => ({
				approvedBy: ctx.events["receive-approval"].input.approvedBy,
			}))
			.end();

		const commander1 = new SQLiteCommander({
			databasePath: temp.path,
			definitions: [mission],
			createMissionId: () => "mission-signal",
		});
		const created = commander1.createMission(mission);
		await created.start({ email: "hello@example.com" });
		commander1.close();

		const commander2 = new SQLiteCommander({
			databasePath: temp.path,
			definitions: [mission],
		});
		const loaded =
			await commander2.getMission<typeof mission>("mission-signal");
		assert.ok(loaded);
		await loaded.signal("receive-approval", { approvedBy: "ops" });
		await loaded.waitForCompletion();
		assert.equal(loaded.inspect().snapshot.status, "completed");
		commander2.close();
	} finally {
		rmSync(temp.dir, { recursive: true, force: true });
	}
});

test("SQLiteCommander resumes sleep timers after reload", async () => {
	const temp = createTempDbPath();
	const clock = new FakeClock();
	try {
		const mission = m
			.define("reminder")
			.start({
				input: {
					parse: i => i as { id: string },
				},
				run: async ({ ctx }) => ({ id: ctx.events.start.input.id }),
			})
			.sleep("pause", 1000)
			.step("finish", async () => ({ ok: true }))
			.end();

		const commander1 = new SQLiteCommander({
			databasePath: temp.path,
			definitions: [mission],
			clock,
			createMissionId: () => "mission-timer",
		});
		const created = commander1.createMission(mission);
		await created.start({ id: "123" });
		commander1.close();

		const commander2 = new SQLiteCommander({
			databasePath: temp.path,
			definitions: [mission],
			clock,
		});
		const loaded = await commander2.getMission<typeof mission>("mission-timer");
		assert.ok(loaded);
		await clock.advanceBy(1000);
		await loaded.waitForCompletion();
		assert.equal(loaded.inspect().snapshot.status, "completed");
		commander2.close();
	} finally {
		rmSync(temp.dir, { recursive: true, force: true });
	}
});

test("SQLiteCommander resumes retry backoff after reload", async () => {
	const temp = createTempDbPath();
	const clock = new FakeClock();
	let attempts = 0;
	try {
		const mission = m
			.define("retry-durable")
			.start({
				input: {
					parse: i => i as { id: string },
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

		const commander1 = new SQLiteCommander({
			databasePath: temp.path,
			definitions: [mission],
			clock,
			createMissionId: () => "mission-retry",
		});
		const created = commander1.createMission(mission);
		await created.start({ id: "123" });
		assert.equal(created.status, "waiting");
		commander1.close();

		const commander2 = new SQLiteCommander({
			databasePath: temp.path,
			definitions: [mission],
			clock,
		});
		const loaded = await commander2.getMission<typeof mission>("mission-retry");
		assert.ok(loaded);
		await clock.advanceBy(1000);
		await loaded.waitForCompletion();
		assert.equal(loaded.inspect().snapshot.status, "completed");
		commander2.close();
	} finally {
		rmSync(temp.dir, { recursive: true, force: true });
	}
});
