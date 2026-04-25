import assert from "node:assert/strict";
import test from "node:test";

import type { MissionInspection } from "@mission-control/core";

import { deserializeInspection, serializeInspection } from "./serialization.ts";

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

test("serializeInspection preserves large nested context payloads", () => {
	const largeText = "x".repeat(256 * 1024);
	const inspection: MissionInspection = {
		snapshot: {
			missionId: "mission-large",
			missionName: "example",
			status: "waiting",
			cursor: 1,
			error: undefined,
			ctx: {
				missionId: "mission-large",
				events: {
					start: {
						input: {
							payload: {
								depth: { text: largeText },
							},
						},
					},
				},
			},
			waiting: {
				kind: "signal",
				eventName: "approval",
				nodeIndex: 1,
			},
		},
		history: [{ type: "mission-created", at: new Date(0).toISOString() }],
		stepAttempts: [],
		signals: [],
		timers: [],
	};

	const row = serializeInspection(inspection, "2020-01-01T00:00:00.000Z");
	const deserialized = deserializeInspection(row);

	assert.equal(
		(
			deserialized.snapshot.ctx.events["start"]?.input as {
				payload: { depth: { text: string } };
			}
		).payload.depth.text.length,
		largeText.length,
	);
});

test("serializeInspection preserves unicode signal payloads", () => {
	const inspection: MissionInspection = {
		snapshot: {
			missionId: "mission-unicode",
			missionName: "example",
			status: "completed",
			cursor: 3,
			error: undefined,
			ctx: {
				missionId: "mission-unicode",
				events: {
					start: { input: { id: "1" } },
				},
			},
			waiting: undefined,
		},
		history: [{ type: "mission-created", at: new Date(0).toISOString() }],
		stepAttempts: [],
		signals: [
			{
				eventName: "approval",
				receivedAt: new Date(0).toISOString(),
				payload: { text: "こんにちは 🌍" },
			},
		],
		timers: [],
	};

	const row = serializeInspection(inspection, "2020-01-01T00:00:00.000Z");
	const deserialized = deserializeInspection(row);

	assert.equal(
		(deserialized.signals[0]?.payload as { text: string }).text,
		"こんにちは 🌍",
	);
});
