import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { MissionInspection } from "@mission-control/core";

import { SQLiteStore } from "./store.ts";

function createTempDbPath(): { dir: string; path: string } {
	const dir = mkdtempSync(join(tmpdir(), "mission-control-sqlite-store-"));
	return { dir, path: join(dir, "missions.sqlite") };
}

function createInspection(): MissionInspection {
	return {
		snapshot: {
			missionId: "mission-1",
			missionName: "demo",
			status: "waiting",
			cursor: 2,
			error: undefined,
			ctx: {
				missionId: "mission-1",
				events: { start: { input: { id: "123" } } },
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
}

test("SQLiteStore persists and reloads mission inspections", () => {
	const temp = createTempDbPath();
	try {
		const store = SQLiteStore.open({ databasePath: temp.path });
		const inspection = createInspection();
		store.saveInspection(inspection);
		const reloaded = store.loadInspection("mission-1");
		assert.ok(reloaded);
		assert.equal(reloaded.snapshot.missionName, "demo");
		assert.equal(store.listWaitingSnapshots().length, 1);
		store.close();
	} finally {
		rmSync(temp.dir, { recursive: true, force: true });
	}
});

test("SQLiteStore exposes incomplete mission ids and start_at entries", () => {
	const temp = createTempDbPath();
	try {
		const store = SQLiteStore.open({ databasePath: temp.path });

		const startAtDue = new Date(1_000).toISOString();
		store.saveInspection({
			snapshot: {
				missionId: "mission-start-at",
				missionName: "demo",
				status: "waiting",
				cursor: 1,
				error: undefined,
				ctx: { missionId: "mission-start-at", events: {} },
				waiting: {
					kind: "timer",
					eventName: "start_at:email-reminder",
					nodeIndex: 1,
					timerDueAt: startAtDue,
				},
			},
			history: [{ type: "mission-created", at: new Date(0).toISOString() }],
			stepAttempts: [],
			signals: [],
			timers: [
				{
					eventName: "start_at:email-reminder",
					kind: "sleep",
					scheduledAt: new Date(0).toISOString(),
					dueAt: startAtDue,
					status: "scheduled",
				},
			],
		});

		store.saveInspection({
			snapshot: {
				missionId: "mission-running",
				missionName: "demo",
				status: "running",
				cursor: 1,
				error: undefined,
				ctx: { missionId: "mission-running", events: {} },
				waiting: undefined,
			},
			history: [{ type: "mission-created", at: new Date(0).toISOString() }],
			stepAttempts: [],
			signals: [],
			timers: [],
		});

		store.saveInspection({
			snapshot: {
				missionId: "mission-completed",
				missionName: "demo",
				status: "completed",
				cursor: 2,
				error: undefined,
				ctx: { missionId: "mission-completed", events: {} },
				waiting: undefined,
			},
			history: [{ type: "mission-created", at: new Date(0).toISOString() }],
			stepAttempts: [],
			signals: [],
			timers: [],
		});

		assert.deepEqual(store.listIncompleteMissionIds().sort(), [
			"mission-running",
			"mission-start-at",
		]);
		assert.deepEqual(store.listStartAtEntries(), [
			{ missionId: "mission-start-at", startAt: startAtDue },
		]);

		store.close();
	} finally {
		rmSync(temp.dir, { recursive: true, force: true });
	}
});
