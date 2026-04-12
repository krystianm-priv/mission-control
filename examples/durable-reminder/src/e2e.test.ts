import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryCommander } from "@mission-control/in-memory-commander";
import { MissionValidationError } from "@mission-control/core";

import { durableReminderMission } from "./mission-definition.ts";

const validInput = {
	recipient: "user@example.com",
	message: "hello",
};

const invalidInput = {
	recipient: "not-an-email",
	message: "",
};

test("e2e: durable reminder happy path", async () => {
	const commander = new InMemoryCommander({
		createMissionId: () => "reminder-1",
		definitions: [durableReminderMission],
	});

	const mission = commander.createMission(durableReminderMission);

	await mission.start(validInput);

	// should be waiting on sleep
	assert.equal(mission.status, "waiting");

	// wait for sleep to pass
	await new Promise((r) => setTimeout(r, 1100));

	await mission.waitForCompletion();

	assert.equal(mission.status, "completed");

	const state = mission.inspect();

	assert.equal(
		(state.snapshot.ctx.events.start?.input as { recipient: string }).recipient,
		validInput.recipient,
	);

	assert.equal(
		(state.snapshot.ctx.events["send-reminder"]?.output as { sentTo: string }).sentTo,
		validInput.recipient,
	);

	assert.equal(
		(state.snapshot.ctx.events["send-reminder"]?.output as { body: string }).body,
		validInput.message,
	);
});

test("e2e: invalid start input fails fast", async () => {
	const commander = new InMemoryCommander({
		createMissionId: () => "reminder-2",
		definitions: [durableReminderMission],
	});

	const mission = commander.createMission(durableReminderMission);

	await assert.rejects(
		() => mission.start(invalidInput as never),
		MissionValidationError,
	);

	assert.equal(mission.status, "failed");
});

test("e2e: sleep actually delays execution", async () => {
	const commander = new InMemoryCommander({
		createMissionId: () => "reminder-3",
		definitions: [durableReminderMission],
	});

	const mission = commander.createMission(durableReminderMission);

	const startTime = Date.now();

	await mission.start(validInput);

	assert.equal(mission.status, "waiting");

	await mission.waitForCompletion();

	const duration = Date.now() - startTime;

	assert.equal(mission.status, "completed");

	// should be at least ~1s (allow jitter)
	assert.ok(duration >= 900);

	const state = mission.inspect();

	assert.ok(state.snapshot.ctx.events["wait-before-send"]);
	assert.ok(state.snapshot.ctx.events["send-reminder"]);
});