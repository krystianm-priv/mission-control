import assert from "node:assert/strict";
import test from "node:test";

import type { MissionInspection } from "@mission-control/core";

import { deserializeInspection, serializeInspection } from "./serialization.js";

test("serializeInspection round-trips mission inspection state", () => {
	const inspection: MissionInspection = {
		snapshot: {
			missionId: "mission-1",
			missionName: "example",
			status: "waiting",
			cursor: 2,
			error: undefined,
			ctx: {
				missionId: "mission-1",
				events: { start: { input: { ok: true } } },
			},
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

	const row = serializeInspection(inspection, "2020-01-01T00:00:00.000Z");
	const deserialized = deserializeInspection(row);

	assert.deepEqual(deserialized.snapshot, {
		missionId: inspection.snapshot.missionId,
		missionName: inspection.snapshot.missionName,
		status: inspection.snapshot.status,
		cursor: inspection.snapshot.cursor,
		error: inspection.snapshot.error,
		ctx: inspection.snapshot.ctx,
		waiting: inspection.snapshot.waiting,
	});
	assert.deepEqual(deserialized.history, inspection.history);
});
