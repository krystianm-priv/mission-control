import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createSqlitePersistenceAdapter } from "@mission-control/adapter-sqlite";
import {
	createCommander,
	m,
	type RecoverableMissionInspection,
} from "@mission-control/core";

const TEST_TIMEOUT_MS = 12_000;

async function waitForCondition(
	condition: () => boolean,
	timeoutMs: number,
): Promise<void> {
	const started = Date.now();
	while (!condition()) {
		if (Date.now() - started > timeoutMs) {
			throw new Error("Timed out while waiting for condition.");
		}
		await new Promise<void>((resolve) => {
			setTimeout(resolve, 5);
		});
	}
}

function createTempDbPath(): { dir: string; path: string } {
	const dir = mkdtempSync(join(tmpdir(), "mission-control-public-api-tests-"));
	return { dir, path: join(dir, "missions.sqlite") };
}

function parseStart(input: unknown): { id: string } {
	const value = input as { id?: unknown };
	if (typeof value.id !== "string") {
		throw new Error("Invalid id.");
	}
	return { id: value.id };
}

const parseApproval = (input: unknown): { approvedBy: string } => {
	const value = input as { approvedBy?: unknown };
	if (typeof value.approvedBy !== "string") {
		throw new Error("Invalid approval.");
	}
	return { approvedBy: value.approvedBy };
};

test(
	"sqlite durability: user can resume by mission id after process restart",
	{ timeout: TEST_TIMEOUT_MS },
	async () => {
		const temp = createTempDbPath();
		const mission = m
			.define("durable-user-resume")
			.start({
				input: { parse: parseStart },
				run: async ({ ctx }) => ({ id: ctx.events.start.input.id }),
			})
			.needTo("approve", { parse: parseApproval })
			.step("finish", async ({ ctx }) => ({
				approvedBy: ctx.events.approve.input.approvedBy,
			}))
			.end();

		try {
			const commander1 = createCommander({
				persistence: createSqlitePersistenceAdapter({
					databasePath: temp.path,
				}),
				definitions: [mission],
				createMissionId: () => "durable-id-1",
			});
			const created = await commander1.start(mission, { id: "first" });
			assert.equal(created.status, "waiting");
			commander1.close();

			const commander2 = createCommander({
				persistence: createSqlitePersistenceAdapter({
					databasePath: temp.path,
				}),
				definitions: [mission],
			});
			const retrieved =
				await commander2.getMission<typeof mission>("durable-id-1");
			assert.ok(retrieved);
			if (!retrieved) {
				assert.fail("mission should be retrievable after restart");
			}
			await retrieved.signal("approve", { approvedBy: "ops" });
			const completed = await retrieved.waitForCompletion();
			assert.equal(completed.status, "completed");
			commander2.close();
		} finally {
			rmSync(temp.dir, { recursive: true, force: true });
		}
	},
);

test(
	"sqlite durability: signal replay after completion is rejected",
	{ timeout: TEST_TIMEOUT_MS },
	async () => {
		const temp = createTempDbPath();
		const mission = m
			.define("durable-signal-replay")
			.start({ input: { parse: parseStart }, run: async () => ({ ok: true }) })
			.needTo("approve", { parse: parseApproval })
			.end();

		try {
			const commander = createCommander({
				persistence: createSqlitePersistenceAdapter({
					databasePath: temp.path,
				}),
				definitions: [mission],
				createMissionId: () => "durable-id-2",
			});
			const handle = await commander.start(mission, { id: "r1" });
			await handle.signal("approve", { approvedBy: "ops" });
			await handle.waitForCompletion();

			await assert.rejects(
				() => handle.signal("approve", { approvedBy: "ops" }),
				/not waiting|status/i,
			);
			commander.close();
		} finally {
			rmSync(temp.dir, { recursive: true, force: true });
		}
	},
);

test(
	"sqlite durability: recovery handles waiting timers and later signals",
	{ timeout: TEST_TIMEOUT_MS },
	async () => {
		const temp = createTempDbPath();
		const mission = m
			.define("durable-timer-signal")
			.start({
				input: { parse: parseStart },
				run: async ({ ctx }) => ({ id: ctx.events.start.input.id }),
			})
			.sleep("pause", 25)
			.needTo("approve", { parse: parseApproval })
			.step("finish", async ({ ctx }) => ({
				id: ctx.events.start.output.id,
				approvedBy: ctx.events.approve.input.approvedBy,
			}))
			.end();

		try {
			const commander1 = createCommander({
				persistence: createSqlitePersistenceAdapter({
					databasePath: temp.path,
				}),
				definitions: [mission],
				createMissionId: () => "durable-id-3",
			});
			await commander1.start(mission, { id: "timer" });
			commander1.close();

			const commander2 = createCommander({
				persistence: createSqlitePersistenceAdapter({
					databasePath: temp.path,
				}),
				definitions: [mission],
			});
			const recovered =
				await commander2.getMission<typeof mission>("durable-id-3");
			assert.ok(recovered);
			if (!recovered) {
				assert.fail("mission should be recovered");
			}

			await waitForCondition(
				() => recovered.inspect().snapshot.waiting?.kind === "signal",
				2_000,
			);
			assert.equal(recovered.inspect().snapshot.waiting?.kind, "signal");
			await recovered.signal("approve", { approvedBy: "qa" });
			const snapshot = await recovered.waitForCompletion();
			assert.equal(snapshot.status, "completed");
			commander2.close();
		} finally {
			rmSync(temp.dir, { recursive: true, force: true });
		}
	},
);

test(
	"sqlite durability: unregistered mission definitions cannot be recovered",
	{ timeout: TEST_TIMEOUT_MS },
	async () => {
		const temp = createTempDbPath();
		const mission = m
			.define("durable-missing-definition")
			.start({ input: { parse: parseStart }, run: async () => ({ ok: true }) })
			.needTo("approve", { parse: parseApproval })
			.end();

		try {
			const commander1 = createCommander({
				persistence: createSqlitePersistenceAdapter({
					databasePath: temp.path,
				}),
				definitions: [mission],
				createMissionId: () => "durable-id-4",
			});
			await commander1.start(mission, { id: "x" });
			commander1.close();

			const commander2 = createCommander({
				persistence: createSqlitePersistenceAdapter({
					databasePath: temp.path,
				}),
			});
			const loaded =
				await commander2.getMission<typeof mission>("durable-id-4");
			assert.equal(loaded, undefined);
			commander2.close();
		} finally {
			rmSync(temp.dir, { recursive: true, force: true });
		}
	},
);

test(
	"durability edge: malformed recoverable inspection should fail startup readiness",
	{ timeout: TEST_TIMEOUT_MS },
	async () => {
		let savedInspection:
			| import("@mission-control/core").MissionInspection
			| undefined;
		const malformedInspection = {
			snapshot: {
				missionId: "bad-recoverable",
				missionName: "bad-recoverable-mission",
				status: "waiting",
				cursor: 1,
				error: undefined,
				ctx: { missionId: "bad-recoverable", events: {} },
				waiting: undefined,
			},
			history: [],
			stepAttempts: [],
			signals: [],
			timers: [],
		} as unknown as RecoverableMissionInspection;

		const mission = m
			.define("bad-recoverable-mission")
			.start({ input: { parse: parseStart }, run: async () => ({ ok: true }) })
			.needTo("approve", { parse: parseApproval })
			.end();

		const commander = createCommander({
			definitions: [mission],
			persistence: {
				bootstrap: () => {},
				saveInspection: (inspection) => {
					savedInspection = inspection;
				},
				loadInspection: () => undefined,
				listWaitingSnapshots: () => [],
				listScheduledSnapshots: () => [],
				listRecoverableInspections: () => [malformedInspection],
			},
		});

		await assert.rejects(
			() => commander.waitUntilReady(),
			/waiting metadata|sync|error/i,
		);
		assert.equal(savedInspection?.snapshot.status, "failed");
	},
);
