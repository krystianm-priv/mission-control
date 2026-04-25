import type {
	CommanderCreateOptions,
	MissionDefinition,
	MissionHandle,
	MissionInspection,
	MissionSnapshot,
} from "@mission-control/core";
import type { CommanderRuntime } from "@mission-control/runtime";

export interface CreateCommanderClientOptions {
	runtime: CommanderRuntime;
}

export interface CommanderClientHandle<M extends MissionDefinition> {
	readonly missionId: string;
	signal: MissionHandle<M>["signal"];
	query(name: string): Promise<unknown>;
	update(name: string, input: unknown): Promise<unknown>;
	cancel(reason?: string): Promise<MissionSnapshot>;
	result(): Promise<MissionSnapshot>;
	inspect: MissionHandle<M>["inspect"];
}

export interface CommanderClient {
	startMission<M extends MissionDefinition>(
		definition: M,
		input: M["context"]["events"]["start"]["input"],
		options?: CommanderCreateOptions,
	): Promise<CommanderClientHandle<M>>;
	getMission<M extends MissionDefinition>(
		missionId: string,
	): Promise<CommanderClientHandle<M> | undefined>;
	cancelMission(missionId: string, reason?: string): Promise<MissionSnapshot>;
	inspectMission(missionId: string): Promise<MissionInspection | undefined>;
	listWaitingMissions(): Promise<MissionSnapshot[]>;
	listScheduledMissions(): Promise<MissionSnapshot[]>;
}

function wrapHandle<M extends MissionDefinition>(
	handle: MissionHandle<M>,
): CommanderClientHandle<M> {
	return {
		missionId: handle.missionId,
		signal: handle.signal.bind(handle),
		query: async (name) => {
			if (!handle.query) {
				throw new Error("This mission handle does not support queries.");
			}
			return handle.query(name);
		},
		update: async (name, input) => {
			if (!handle.update) {
				throw new Error("This mission handle does not support updates.");
			}
			return handle.update(name, input);
		},
		cancel: (reason) => handle.cancel(reason),
		result: async () => {
			if (handle.result) {
				return handle.result();
			}
			return handle.waitForCompletion();
		},
		inspect: handle.inspect.bind(handle),
	};
}

export function createCommanderClient(
	options: CreateCommanderClientOptions,
): CommanderClient {
	return {
		startMission: async (definition, input, createOptions) => {
			const handle = await options.runtime.commander.start(
				definition,
				input,
				createOptions,
			);
			return wrapHandle(handle);
		},
		getMission: async (missionId) => {
			const handle = await options.runtime.commander.getMission(missionId);
			return handle ? wrapHandle(handle) : undefined;
		},
		cancelMission: (missionId, reason) =>
			options.runtime.commander.cancelMission(missionId, reason),
		inspectMission: (missionId) =>
			options.runtime.commander.loadMission(missionId),
		listWaitingMissions: () => options.runtime.commander.listWaiting(),
		listScheduledMissions: () => options.runtime.commander.listScheduled(),
	};
}
