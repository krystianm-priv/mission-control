import assert from "node:assert/strict";
import test from "node:test";
import { MissionValidationError } from "@mission-control/core";
import { InMemoryCommander } from "@mission-control/in-memory-commander";

import { askForReviewMission } from "./mission-definition.ts";

const validEmail = "user@example.com";
const invalidEmail = "not-an-email";

test("e2e: full happy path", async () => {
	const commander = new InMemoryCommander({
		createMissionId: () => "mission-e2e-1",
		definitions: [askForReviewMission],
	});

	const mission = commander.createMission(askForReviewMission);

	await mission.start({ email: validEmail });

	assert.equal(mission.status, "waiting");

	await mission.signal("receive-review", "great product!");

	assert.equal(mission.status, "completed");

	const state = mission.inspect();

	assert.deepEqual(state.snapshot.ctx.events.start?.input, {
		email: validEmail,
	});
	assert.deepEqual(state.snapshot.ctx.events.start?.output, {
		recordId: (state.snapshot.ctx.events.start?.output as { recordId: string })
			?.recordId,
	});
	assert.equal(
		state.snapshot.ctx.events["receive-review"]?.input,
		"great product!",
	);
	assert.deepEqual(state.snapshot.ctx.events["anti-spam"]?.output, {
		isSpam: false,
	});

	assert.ok(state.snapshot.ctx.events.start);
	assert.ok(state.snapshot.ctx.events["receive-review"]);
	assert.ok(state.snapshot.ctx.events["anti-spam"]);
	assert.ok(state.snapshot.ctx.events["update-record"]);
});

test("e2e: invalid start input fails fast", async () => {
	const commander = new InMemoryCommander({
		createMissionId: () => "mission-e2e-2",
		definitions: [askForReviewMission],
	});

	const mission = commander.createMission(askForReviewMission);

	await assert.rejects(
		() => mission.start({ email: invalidEmail }),
		MissionValidationError,
	);

	assert.equal(mission.status, "failed");
});

test("e2e: invalid signal input fails", async () => {
	const commander = new InMemoryCommander({
		createMissionId: () => "mission-e2e-3",
		definitions: [askForReviewMission],
	});

	const mission = commander.createMission(askForReviewMission);

	await mission.start({ email: validEmail });

	await assert.rejects(
		() => mission.signal("receive-review", 123 as never),
		MissionValidationError,
	);

	assert.equal(mission.status, "failed");
});

test("e2e: spam review causes failure", async () => {
	const commander = new InMemoryCommander({
		createMissionId: () => "mission-e2e-4",
		definitions: [askForReviewMission],
	});

	const mission = commander.createMission(askForReviewMission);

	await mission.start({ email: validEmail });

	await assert.rejects(() =>
		mission.signal("receive-review", "this is spam content"),
	);

	assert.equal(mission.status, "failed");

	const state = mission.inspect();

	assert.ok(state.snapshot.ctx.events["anti-spam"]);
});
