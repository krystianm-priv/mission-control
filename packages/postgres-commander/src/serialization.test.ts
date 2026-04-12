import assert from "node:assert/strict";
import test from "node:test";

import type { MissionInspection } from "@mission-control/commander";

import { deserializeMissionState, serializeMissionState } from "./serialization.js";

test("serializeMissionState round-trips mission inspection state", () => {
	const inspection: MissionInspection = {
		snapshot: {
			missionId: "mission-1",
			missionName: "example",
			status: "waiting",
			cursor: 2,
			error: undefined,
			ctx: { missionId: "mission-1", events: { start: { input: { ok: true } } } },
			waiting: {
				kind: "signal",
				eventName: "approval",
				nodeIndex: 2,
			},
		},
		history: [{ type: "mission-created", at: new Date(0).toISOString() }],
		stepAttempts: [],
		signals: [],
		timers: [],
	};

	const serialized = serializeMissionState(inspection);
	const deserialized = deserializeMissionState(serialized);

	assert.deepEqual(deserialized.snapshot, {
		missionId: inspection.snapshot.missionId,
		missionName: inspection.snapshot.missionName,
		status: inspection.snapshot.status,
		cursor: inspection.snapshot.cursor,
		ctx: inspection.snapshot.ctx,
		waiting: inspection.snapshot.waiting,
	});
	assert.deepEqual(deserialized.history, inspection.history);
});
