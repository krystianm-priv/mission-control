import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { MissionInspection } from "@mission-control/core";

import { PgStore } from "./store.js";

async function createPGlite(): Promise<
	| {
			db: { exec(query: string): Promise<unknown>; close(): Promise<void> };
			dir: string;
			path: string;
	  }
	| undefined
> {
	try {
		const mod = await import("@electric-sql/pglite");
		const dir = mkdtempSync(join(tmpdir(), "mission-control-pg-store-"));
		const path = join(dir, "pgdata");
		const db = await mod.PGlite.create(path);
		return { db, dir, path };
	} catch {
		return undefined;
	}
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

test("PgStore persists and reloads mission inspections", async () => {
	const harness = await createPGlite();
	if (!harness) {
		return;
	}

	try {
		const store = new PgStore({ execute: (query) => harness.db.exec(query) });
		await store.bootstrap();
		const inspection = createInspection();
		await store.saveInspection(inspection);
		const reloaded = await store.loadInspection("mission-1");
		assert.ok(reloaded);
		assert.equal(reloaded.snapshot.missionName, "demo");
		assert.equal((await store.listWaitingSnapshots()).length, 1);
	} finally {
		await harness.db.close();
		rmSync(harness.dir, { recursive: true, force: true });
	}
});
