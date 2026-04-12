import {
	Commander,
	type CommanderCreateOptions,
	type CommanderOptions,
	createEngineRuntime,
	type EngineRuntime,
	inspectRuntime,
	type MissionDefinition,
	type MissionHandle,
	type MissionInspection,
	type MissionSnapshot,
	realClock,
	signalRuntime,
	startRuntime,
	waitForCompletion,
} from "@mission-control/core";

export interface InMemoryCommanderOptions extends CommanderOptions {}

export class InMemoryCommander extends Commander {
	private readonly missions = new Map<string, EngineRuntime>();

	public constructor(options: InMemoryCommanderOptions = {}) {
		const baseOptions: CommanderOptions = {
			clock: options.clock ?? realClock,
		};
		if (options.createMissionId) {
			baseOptions.createMissionId = options.createMissionId;
		}
		if (options.definitions) {
			baseOptions.definitions = options.definitions;
		}
		super(baseOptions);
	}

	public override createMission<M extends MissionDefinition>(
		definition: M,
		options: CommanderCreateOptions = {},
	): MissionHandle<M> {
		this.registerMission(definition);
		const missionId = options.missionId ?? this.createMissionId();
		const runtime = createEngineRuntime(definition, missionId, {
			clock: this.clock,
		});
		this.missions.set(missionId, runtime);
		return this.createHandle(runtime);
	}

	public override async getMission<M extends MissionDefinition>(
		missionId: string,
	): Promise<MissionHandle<M> | undefined> {
		const runtime = this.missions.get(missionId);
		return runtime ? this.createHandle(runtime as EngineRuntime) : undefined;
	}

	public override async loadMission(
		missionId: string,
	): Promise<MissionInspection | undefined> {
		const runtime = this.missions.get(missionId);
		return runtime ? inspectRuntime(runtime) : undefined;
	}

	public override async listWaiting(): Promise<MissionSnapshot[]> {
		return [...this.missions.values()]
			.filter((runtime) => runtime.snapshot.status === "waiting")
			.map((runtime) => structuredClone(runtime.snapshot));
	}

	public override async listScheduled(): Promise<MissionSnapshot[]> {
		return [...this.missions.values()]
			.filter(
				(runtime) =>
					runtime.snapshot.waiting?.kind !== undefined &&
					runtime.snapshot.waiting.kind !== "signal",
			)
			.map((runtime) => structuredClone(runtime.snapshot));
	}

	private createHandle<M extends MissionDefinition>(
		runtime: EngineRuntime,
	): MissionHandle<M> {
		const definition = runtime.definition as M;
		return {
			missionId: runtime.snapshot.missionId,
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
			signal: async (eventName, input) => {
				await signalRuntime(runtime, eventName, input);
			},
			inspect: () => inspectRuntime(runtime),
			getHistory: () => inspectRuntime(runtime).history,
			waitForCompletion: () => waitForCompletion(runtime),
		};
	}
}
