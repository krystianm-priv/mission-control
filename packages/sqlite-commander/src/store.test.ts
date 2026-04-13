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
