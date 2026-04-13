import assert from "node:assert/strict";
import test from "node:test";
import {
	type CommanderPersistenceAdapter,
	createCommander,
	type MissionInspection,
	m,
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
			.filter((inspection) => inspection.snapshot.status === "waiting")
			.map((inspection) => structuredClone(inspection.snapshot));
	}

	public listScheduledSnapshots() {
		return [...this.inspections.values()]
			.filter(
				(inspection) =>
					inspection.snapshot.waiting?.kind !== undefined &&
					inspection.snapshot.waiting.kind !== "signal",
			)
			.map((inspection) => structuredClone(inspection.snapshot));
	}

	public listRecoverableInspections() {
		return [...this.inspections.values()]
			.filter(
				(inspection) =>
					inspection.snapshot.status === "waiting" ||
					inspection.snapshot.status === "running",
			)
			.map((inspection) => structuredClone(inspection));
	}
}

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
