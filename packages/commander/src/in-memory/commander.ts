import type { MissionDefinition } from "@mission-control/core";

import type {
	Commander,
	CommanderCreateOptions,
	MissionHandle,
	MissionInspection,
	MissionSnapshot,
} from "../contracts.js";
import {
	createEngineRuntime,
	inspectRuntime,
	realClock,
	signalRuntime,
	startRuntime,
	waitForCompletion,
	type EngineClock,
	type EngineRuntime,
} from "../engine.js";

export interface InMemoryCommanderOptions {
	clock?: EngineClock;
	createMissionId?: () => string;
}

function createMissionId() {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
		return `mission-${crypto.randomUUID()}`;
	}

	return `mission-${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
}

export class InMemoryCommander implements Commander {
	private readonly missions = new Map<string, EngineRuntime>();
	private readonly definitions = new Map<string, MissionDefinition<any>>();
	private readonly clock: EngineClock;
	private readonly missionIdFactory: () => string;

	public constructor(options: InMemoryCommanderOptions = {}) {
		this.clock = options.clock ?? realClock;
		this.missionIdFactory = options.createMissionId ?? createMissionId;
	}

	public createMission<M extends MissionDefinition<any>>(
		definition: M,
		options: CommanderCreateOptions = {},
	): MissionHandle<M> {
		const missionId = options.missionId ?? this.missionIdFactory();
		const runtime = createEngineRuntime(definition, missionId, this.clock);
		this.missions.set(missionId, runtime);
		this.definitions.set(definition.missionName, definition);

		const handle: MissionHandle<M> = {
			missionId,
			missionName: definition.missionName as M["missionName"],
			get status() {
				return runtime.snapshot.status;
			},
			get error() {
				return runtime.snapshot.error;
			},
			get ctx() {
				return runtime.snapshot.ctx;
			},
			start: async (input) => {
				await startRuntime(runtime, input);
			},
			startMission: async (input) => {
				await startRuntime(runtime, input);
			},
			signal: async (eventName, input) => {
				await signalRuntime(runtime, eventName, input);
			},
			inspect: () => inspectRuntime(runtime),
			getHistory: () => inspectRuntime(runtime).history,
			waitForCompletion: () => waitForCompletion(runtime),
		};

		return handle;
	}

	public loadMission(missionId: string): MissionInspection | undefined {
		const runtime = this.missions.get(missionId);
		return runtime ? inspectRuntime(runtime) : undefined;
	}

	public listWaiting(): MissionSnapshot[] {
		return [...this.missions.values()]
			.filter((runtime) => runtime.snapshot.status === "waiting")
			.map((runtime) => structuredClone(runtime.snapshot));
	}

	public listScheduled(): MissionSnapshot[] {
		return [...this.missions.values()]
			.filter((runtime) => runtime.snapshot.waiting?.kind === "timer")
			.map((runtime) => structuredClone(runtime.snapshot));
	}
}

export const inMemoryCommander = new InMemoryCommander();
