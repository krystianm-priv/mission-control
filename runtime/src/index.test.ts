import assert from "node:assert/strict";
import test from "node:test";

import type {
	MissionInspection,
	RecoverableMissionInspection,
	ScheduledMissionSnapshot,
	WaitingMissionSnapshot,
} from "@mission-control/core";
import { m } from "@mission-control/core";

import { createCommanderRuntime, type RuntimeTickAdapter } from "./index.ts";

interface AdapterState {
	inspections: Map<string, MissionInspection>;
	incompleteIds: string[];
	startAtEntries: Array<{ missionId: string; startAt: string }>;
}

function createAdapter(state: AdapterState): RuntimeTickAdapter {
	return {
		saveInspection: (inspection) => {
			state.inspections.set(inspection.snapshot.missionId, structuredClone(inspection));
		},
		loadInspection: (missionId) => {
			const inspection = state.inspections.get(missionId);
			return inspection ? structuredClone(inspection) : undefined;
		},
		listWaitingSnapshots: () =>
			[...state.inspections.values()]
				.map((inspection) => structuredClone(inspection.snapshot))
				.filter(
					(snapshot): snapshot is WaitingMissionSnapshot =>
						snapshot.status === "waiting" && snapshot.waiting !== undefined,
				),
		listScheduledSnapshots: () =>
			[...state.inspections.values()]
				.map((inspection) => structuredClone(inspection.snapshot))
				.filter(
					(snapshot): snapshot is ScheduledMissionSnapshot =>
						snapshot.status === "waiting" &&
						snapshot.waiting !== undefined &&
						snapshot.waiting.kind !== "signal",
				),
		listRecoverableInspections: () =>
			[...state.inspections.values()]
				.map((inspection) => structuredClone(inspection))
				.filter(
					(
						inspection,
					): inspection is RecoverableMissionInspection =>
						inspection.snapshot.status === "waiting" ||
						inspection.snapshot.status === "running",
				),
		listIncompleteMissionIds: () => [...state.incompleteIds],
		listStartAtEntries: () => [...state.startAtEntries],
	};
}

test("runtime starts, runs startup tick, and stops", async () => {
	const mission = m
		.define("runtime-demo")
		.start({
			input: {
				parse: (input) => input as { id: string },
			},
			run: async ({ ctx }) => ({ id: ctx.events.start.input.id }),
		})
		.end();
	const logs: string[] = [];
	const runtime = createCommanderRuntime({
		definitions: [mission],
		identity: "runtime-a",
		adapter: createAdapter({
			inspections: new Map(),
			incompleteIds: [],
			startAtEntries: [],
		}),
		logger: (event) => {
			logs.push(event.event);
		},
	});

	await runtime.start();
	assert.equal(runtime.identity, "runtime-a");
	assert.equal(logs.includes("tick-started"), true);
	assert.equal(logs.includes("tick-completed"), true);

	const handle = await runtime.commander.start(mission, { id: "123" });
	assert.equal(handle.status, "completed");

	await runtime.stop();
	assert.equal(logs.includes("runtime-stopped"), true);
});

test("runtime enforces one tick at a time", async () => {
	let release: (() => void) | undefined;
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});

	const adapter = createAdapter({
		inspections: new Map(),
		incompleteIds: [],
		startAtEntries: [],
	});

	const runtime = createCommanderRuntime({
		adapter,
		identity: "runtime-lock",
	});

	await runtime.start();
	adapter.listIncompleteMissionIds = async () => {
		await gate;
		return [];
	};
	const firstTick = runtime.tick();
	const skipped = await runtime.tick();

	assert.equal(skipped, false);
	assert.equal(runtime.isTickRunning(), true);

	release?.();
	await firstTick;
	await runtime.stop();
	assert.equal(runtime.isTickRunning(), false);
});

test("runtime supports next tick scheduling and start_at bootstrap scheduling", async () => {
	let tickCalls = 0;
	const now = Date.now();
	const adapter = createAdapter({
		inspections: new Map(),
		incompleteIds: [],
		startAtEntries: [
			{ missionId: "m-1", startAt: new Date(now + 5).toISOString() },
		],
	});
	adapter.listIncompleteMissionIds = () => {
		tickCalls += 1;
		return [];
	};

	const runtime = createCommanderRuntime({
		adapter,
	});
	await runtime.start();
	assert.equal(tickCalls >= 1, true);

	runtime.setNextTickIn(5);
	await new Promise((resolve) => setTimeout(resolve, 20));
	assert.equal(tickCalls >= 2, true);

	await runtime.stop();
});

test("tick resumes incomplete missions without awaiting mission completion", async () => {
	const mission = m
		.define("resume-demo")
		.start({
			input: { parse: (input) => input as { id: string } },
			run: async ({ ctx }) => ({ id: ctx.events.start.input.id }),
		})
		.step("work", async ({ ctx }) => ({ id: ctx.events.start.output.id }))
		.end();

	const state: AdapterState = {
		inspections: new Map(),
		incompleteIds: [],
		startAtEntries: [],
	};
	const adapter = createAdapter(state);
	const runtime = createCommanderRuntime({
		definitions: [mission],
		adapter,
		identity: "runtime-resume",
	});

	await runtime.start();
	const created = runtime.commander.createMission(mission, {
		missionId: "resume-1",
	});
	await created.start({ id: "abc" });

	state.incompleteIds = ["resume-1"];
	const triggered = await runtime.tick();
	assert.equal(triggered, true);

	await runtime.stop();
});
