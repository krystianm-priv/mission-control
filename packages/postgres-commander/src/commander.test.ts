import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { type EngineClock, m } from "@mission-control/core";
import { z } from "zod/v4";

import { PgCommander } from "./commander.ts";

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
				input: z.object({ email: z.email() }),
				run: async ({ ctx }) => ({ email: ctx.events.start.input.email }),
			})
			.needTo("receive-approval", z.object({ approvedBy: z.string() }))
			.step("archive", async ({ ctx }) => ({
				approvedBy: ctx.events["receive-approval"].input.approvedBy,
			}))
			.end();

		const commander1 = new PgCommander({
			execute: await harness.createExecute(),
			definitions: [mission],
			createMissionId: () => "mission-signal",
		});
		const created = commander1.createMission(mission);
		await created.start({ email: "hello@example.com" });
		commander1.close();

		const commander2 = new PgCommander({
			execute: await harness.createExecute(),
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
				input: z.object({ id: z.string() }),
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
				input: z.object({ id: z.string() }),
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
