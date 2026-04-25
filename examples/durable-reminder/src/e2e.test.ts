import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	type EngineClock,
	MissionValidationError,
} from "@mission-control/core";

import { createDurableReminderCommander } from "./index.ts";
import { durableReminderMission } from "./mission-definition.ts";

const validInput = {
	recipient: "user@example.com",
	message: "hello",
};

const invalidInput = {
	recipient: "not-an-email",
	message: "",
};

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

function createSQLiteHarness(): { databasePath: string; cleanup: () => void } {
	const dir = mkdtempSync(join(tmpdir(), "mission-control-durable-reminder-"));
	return {
		databasePath: join(dir, "missions.sqlite"),
		cleanup: () => {
			rmSync(dir, { recursive: true, force: true });
		},
	};
}

test("e2e: durable reminder happy path uses the sqlite adapter", async () => {
	const harness = createSQLiteHarness();

	const clock = new FakeClock();

	try {
		const commander = createDurableReminderCommander({
			databasePath: harness.databasePath,
			clock,
			createMissionId: () => "reminder-1",
		});
		const mission = await commander.start(durableReminderMission, validInput);

		assert.equal(mission.status, "waiting");

		await clock.advanceBy(1000);
		await mission.waitForCompletion();

		assert.equal(mission.status, "completed");

		const state = mission.inspect();

		assert.equal(
			(state.snapshot.ctx.events["start"]?.input as { recipient: string })
				.recipient,
			validInput.recipient,
		);

		assert.equal(
			(state.snapshot.ctx.events["send-reminder"]?.output as { sentTo: string })
				.sentTo,
			validInput.recipient,
		);

		assert.equal(
			(state.snapshot.ctx.events["send-reminder"]?.output as { body: string })
				.body,
			validInput.message,
		);

		commander.close();
	} finally {
		harness.cleanup();
	}
});

test("e2e: invalid start input fails fast", async () => {
	const harness = createSQLiteHarness();

	try {
		const commander = createDurableReminderCommander({
			databasePath: harness.databasePath,
			createMissionId: () => "reminder-2",
		});

		await assert.rejects(
			() => commander.start(durableReminderMission, invalidInput as never),
			MissionValidationError,
		);

		const mission =
			await commander.getMission<typeof durableReminderMission>("reminder-2");
		assert.ok(mission);
		assert.equal(mission.status, "failed");
		commander.close();
	} finally {
		harness.cleanup();
	}
});

test("e2e: durable reminder sleep stays scheduled until the clock advances", async () => {
	const harness = createSQLiteHarness();

	const clock = new FakeClock();

	try {
		const commander = createDurableReminderCommander({
			databasePath: harness.databasePath,
			clock,
			createMissionId: () => "reminder-3",
		});
		const mission = await commander.start(durableReminderMission, validInput);

		assert.equal(mission.status, "waiting");

		await clock.advanceBy(500);
		assert.equal(mission.status, "waiting");

		await clock.advanceBy(500);
		await mission.waitForCompletion();

		assert.equal(mission.status, "completed");

		const state = mission.inspect();

		assert.ok(state.snapshot.ctx.events["wait-before-send"]);
		assert.ok(state.snapshot.ctx.events["send-reminder"]);

		commander.close();
	} finally {
		harness.cleanup();
	}
});
