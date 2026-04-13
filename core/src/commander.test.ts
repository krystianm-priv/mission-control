import assert from "node:assert/strict";
import test from "node:test";
import {
	type CommanderPersistenceAdapter,
	createCommander,
	isRecoverableMissionInspection,
	isScheduledMissionSnapshot,
	isWaitingMissionSnapshot,
	type MissionInspection,
	m,
	type RecoverableMissionInspection,
} from "./index.ts";

class MemoryPersistenceAdapter implements CommanderPersistenceAdapter {
	private readonly inspections = new Map<string, MissionInspection>();

	public saveInspection(inspection: MissionInspection): void {
		this.inspections.set(
			inspection.snapshot.missionId,
			structuredClone(inspection),
		);
	}

	public loadInspection(missionId: string): MissionInspection | undefined {
		const inspection = this.inspections.get(missionId);
		return inspection ? structuredClone(inspection) : undefined;
	}

	public listWaitingSnapshots() {
		return [...this.inspections.values()]
			.map((inspection) => structuredClone(inspection.snapshot))
			.filter(isWaitingMissionSnapshot);
	}

	public listScheduledSnapshots() {
		return [...this.inspections.values()]
			.map((inspection) => structuredClone(inspection.snapshot))
			.filter(isScheduledMissionSnapshot);
	}

	public listRecoverableInspections() {
		return [...this.inspections.values()]
			.map((inspection) => structuredClone(inspection))
			.filter(isRecoverableMissionInspection);
	}
}

test("createCommander bootstraps persistence before recovery and closes the adapter", async () => {
	const events: string[] = [];
	const mission = m
		.define("recover")
		.start({
			input: { parse: (input) => input as { id: string } },
			run: async () => ({ ok: true }),
		})
		.needTo("resume", {
			parse: (input) => input as { approved: boolean },
		})
		.end();

	const persistedInspection: RecoverableMissionInspection = {
		snapshot: {
			missionId: "mission-recoverable",
			missionName: "recover",
			status: "waiting",
			cursor: 1,
			error: undefined,
			ctx: {
				missionId: "mission-recoverable",
				events: {
					start: {
						input: { id: "123" },
						output: { ok: true },
					},
				},
			},
			waiting: {
				kind: "signal",
				eventName: "resume",
				nodeIndex: 1,
			},
		},
		history: [
			{ type: "mission-created", at: "1970-01-01T00:00:00.000Z" },
			{ type: "mission-started", at: "1970-01-01T00:00:00.000Z" },
			{
				type: "waiting-for-signal",
				at: "1970-01-01T00:00:00.000Z",
				eventName: "resume",
			},
		],
		stepAttempts: [],
		signals: [],
		timers: [],
	};

	const persistence: CommanderPersistenceAdapter = {
		bootstrap: () => {
			events.push("bootstrap");
		},
		saveInspection: () => {
			events.push("save");
		},
		loadInspection: () => {
			events.push("load");
			return undefined;
		},
		listWaitingSnapshots: () => {
			events.push("listWaiting");
			return [];
		},
		listScheduledSnapshots: () => {
			events.push("listScheduled");
			return [];
		},
		listRecoverableInspections: () => {
			events.push("listRecoverable");
			return [structuredClone(persistedInspection)];
		},
		close: () => {
			events.push("close");
		},
	};

	const commander = createCommander({
		definitions: [mission],
		persistence,
	});
	const loaded = await commander.getMission<typeof mission>(
		"mission-recoverable",
	);
	assert.ok(loaded);
	assert.deepEqual(events.slice(0, 2), ["bootstrap", "listRecoverable"]);

	commander.close();
	assert.equal(events.at(-1), "close");
});

test("createCommander waits for async initialization before start", async () => {
	let releaseBootstrap!: () => void;
	const bootstrapReady = new Promise<void>((resolve) => {
		releaseBootstrap = resolve;
	});
	const mission = m
		.define("delayed-start")
		.start({
			input: { parse: (input) => input as { id: string } },
			run: async ({ ctx }) => ({ id: ctx.events.start.input.id }),
		})
		.end();

	const commander = createCommander({
		definitions: [mission],
		persistence: {
			bootstrap: () => bootstrapReady,
			saveInspection: () => {},
			loadInspection: () => undefined,
			listWaitingSnapshots: () => [],
			listScheduledSnapshots: () => [],
			listRecoverableInspections: () => [],
		},
	});

	assert.throws(() => commander.createMission(mission), /still initializing/i);

	const startPromise = commander.start(mission, { id: "123" });
	releaseBootstrap();

	const handle = await startPromise;
	assert.equal(handle.status, "completed");
});

test("createCommander defaults to in-memory execution", async () => {
	const mission = m
		.define("approval")
		.start({
			input: { parse: (input) => input as { email: string } },
			run: async ({ ctx }) => ({ email: ctx.events.start.input.email }),
		})
		.needTo("approve", {
			parse: (input) => input as { approvedBy: string },
		})
		.step("archive", async ({ ctx }) => ({
			approvedBy: ctx.events.approve.input.approvedBy,
		}))
		.end();

	const commander = createCommander({
		definitions: [mission],
		createMissionId: () => "mission-create-default",
	});

	const started = await commander.start("approval", {
		email: "hello@example.com",
	});
	const handle = await commander.getMission<typeof mission>(started.missionId);
	assert.ok(handle);
	assert.equal(handle.status, "waiting");
	assert.equal((await commander.listWaiting()).length, 1);

	await handle.signal("approve", { approvedBy: "ops" });
	assert.equal(handle.status, "completed");
});

test("persistence contract helpers classify waiting, scheduled, and recoverable state", () => {
	const waitingInspection: MissionInspection = {
		snapshot: {
			missionId: "mission-waiting",
			missionName: "demo",
			status: "waiting",
			cursor: 1,
			error: undefined,
			ctx: {
				missionId: "mission-waiting",
				events: {},
			},
			waiting: {
				kind: "retry",
				eventName: "step:archive",
				nodeIndex: 1,
				timerDueAt: new Date(0).toISOString(),
			},
		},
		history: [],
		stepAttempts: [],
		signals: [],
		timers: [],
	};

	const completedInspection: MissionInspection = {
		...waitingInspection,
		snapshot: {
			...waitingInspection.snapshot,
			missionId: "mission-completed",
			status: "completed",
			waiting: undefined,
		},
	};

	assert.equal(isWaitingMissionSnapshot(waitingInspection.snapshot), true);
	assert.equal(isScheduledMissionSnapshot(waitingInspection.snapshot), true);
	assert.equal(isRecoverableMissionInspection(waitingInspection), true);
	assert.equal(isWaitingMissionSnapshot(completedInspection.snapshot), false);
	assert.equal(isScheduledMissionSnapshot(completedInspection.snapshot), false);
	assert.equal(isRecoverableMissionInspection(completedInspection), false);
});

test("createCommander resumes missions through a custom persistence adapter", async () => {
	const persistence = new MemoryPersistenceAdapter();
	const mission = m
		.define("resume")
		.start({
			input: { parse: (input) => input as { id: string } },
			run: async ({ ctx }) => ({ id: ctx.events.start.input.id }),
		})
		.needTo("continue", {
			parse: (input) => input as { approved: boolean },
		})
		.step("finish", async ({ ctx }) => ({
			approved: ctx.events.continue.input.approved,
		}))
		.end();

	const commander1 = createCommander({
		definitions: [mission],
		createMissionId: () => "mission-persisted",
		persistence,
	});
	await commander1.start(mission, { id: "123" });
	commander1.close();

	const commander2 = createCommander({
		definitions: [mission],
		persistence,
	});
	const loaded =
		await commander2.getMission<typeof mission>("mission-persisted");
	assert.ok(loaded);
	await loaded.signal("continue", { approved: true });
	await loaded.waitForCompletion();
	assert.equal(loaded.inspect().snapshot.status, "completed");
});

test("waitUntilReady allows createMission after async initialization", async () => {
	let releaseBootstrap!: () => void;
	const bootstrapReady = new Promise<void>((resolve) => {
		releaseBootstrap = resolve;
	});
	const mission = m
		.define("manual-create")
		.start({
			input: { parse: (input) => input as { id: string } },
			run: async ({ ctx }) => ({ id: ctx.events.start.input.id }),
		})
		.end();

	const commander = createCommander({
		definitions: [mission],
		persistence: {
			bootstrap: () => bootstrapReady,
			saveInspection: () => {},
			loadInspection: () => undefined,
			listWaitingSnapshots: () => [],
			listScheduledSnapshots: () => [],
			listRecoverableInspections: () => [],
		},
	});

	releaseBootstrap();
	await commander.waitUntilReady();

	const handle = commander.createMission(mission);
	await handle.start({ id: "123" });
	assert.equal(handle.status, "completed");
});

test("mission handles support additive queries and updates", async () => {
	const mission = m
		.define("query-update")
		.query("status", ({ inspection }) => ({
			status: inspection.snapshot.status,
			hasNote:
				inspection.snapshot.ctx.events["attach-note"]?.output !== undefined,
		}))
		.update(
			"attach-note",
			{
				parse: (input) => {
					const value = input as { note?: unknown };
					if (typeof value.note !== "string") {
						throw new Error("Invalid note.");
					}
					return { note: value.note };
				},
			},
			({ input }) => input.note,
		)
		.start({
			input: { parse: (input) => input as { id: string } },
			run: async ({ ctx }) => ({ id: ctx.events.start.input.id }),
		})
		.needTo("approve", {
			parse: (input) => input as { approvedBy: string },
		})
		.end();

	const commander = createCommander({
		definitions: [mission],
		createMissionId: () => "mission-query-update",
	});

	const handle = await commander.start(mission, { id: "123" });
	assert.deepEqual(await handle.query?.("status"), {
		status: "waiting",
		hasNote: false,
	});
	assert.equal(
		await handle.update?.("attach-note", { note: "hello" }),
		"hello",
	);
	assert.equal(
		handle.inspect().snapshot.ctx.events["attach-note"]?.output,
		"hello",
	);
	assert.deepEqual(await handle.query?.("status"), {
		status: "waiting",
		hasNote: true,
	});
});
