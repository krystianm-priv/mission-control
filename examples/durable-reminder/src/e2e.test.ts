import assert from "node:assert/strict";
import test from "node:test";
import { MissionValidationError } from "@mission-control/core";
import { InMemoryCommander } from "@mission-control/in-memory-commander";

import { durableReminderMission } from "./mission-definition.ts";

const validInput = {
	recipient: "user@example.com",
	message: "hello",
};

const invalidInput = {
	recipient: "not-an-email",
	message: "",
};

test("e2e: durable reminder happy path (mocked timers)", async (t) => {
	const mock = t.mock;

	// ⏱️ fake timers
	mock.timers.enable({ apis: ["setTimeout", "Date"] });

	const commander = new InMemoryCommander({
		createMissionId: () => "reminder-1",
		definitions: [durableReminderMission],
	});

	const mission = commander.createMission(durableReminderMission);

	await mission.start(validInput);

	assert.equal(mission.status, "waiting");

	// ⏩ fast-forward time instead of waiting 1s
	mock.timers.tick(1000);

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

test("e2e: sleep is controlled by mocked time", async (t) => {
	const mock = t.mock;

	mock.timers.enable({ apis: ["setTimeout", "Date"] });

	const commander = new InMemoryCommander({
		createMissionId: () => "reminder-3",
		definitions: [durableReminderMission],
	});

	const mission = commander.createMission(durableReminderMission);

	await mission.start(validInput);

	assert.equal(mission.status, "waiting");

	// not advanced yet → still waiting
	mock.timers.tick(500);
	assert.equal(mission.status, "waiting");

	// complete remaining time
	mock.timers.tick(500);

	await mission.waitForCompletion();

	assert.equal(mission.status, "completed");

	const state = mission.inspect();

	assert.ok(state.snapshot.ctx.events["wait-before-send"]);
	assert.ok(state.snapshot.ctx.events["send-reminder"]);
});
