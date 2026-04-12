import type { MissionDefinition } from "./types.js";
import type {
	CommanderCreateOptions,
	MissionHandle,
	MissionInspection,
	MissionSnapshot,
} from "./contracts.js";
import type { EngineClock } from "./engine.js";

export interface CommanderOptions {
	clock?: EngineClock;
	createMissionId?: () => string;
	definitions?: MissionDefinition<any>[];
}

export function createDefaultMissionId(): string {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
		return `mission-${crypto.randomUUID()}`;
	}

	return `mission-${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
}

export abstract class Commander {
	protected readonly definitions = new Map<string, MissionDefinition<any>>();
	protected readonly clock: EngineClock;
	protected readonly missionIdFactory: () => string;

	public constructor(options: CommanderOptions = {}) {
		this.clock = options.clock ?? { now: () => new Date(), sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)) };
		this.missionIdFactory = options.createMissionId ?? createDefaultMissionId;
		for (const definition of options.definitions ?? []) {
			this.registerMission(definition);
		}
	}

	public registerMission<M extends MissionDefinition<any>>(definition: M): this {
		this.definitions.set(definition.missionName, definition);
		return this;
	}

	protected createMissionId(): string {
		return this.missionIdFactory();
	}

	protected getRegisteredMission(name: string): MissionDefinition<any> | undefined {
		return this.definitions.get(name);
	}

	protected getRequiredMission(name: string): MissionDefinition<any> {
		const definition = this.getRegisteredMission(name);
		if (!definition) {
			throw new Error(
				`Mission definition "${name}" is not registered on this commander instance.`,
			);
		}
		return definition;
	}

	public abstract createMission<M extends MissionDefinition<any>>(
		definition: M,
		options?: CommanderCreateOptions,
	): MissionHandle<M>;

	public abstract getMission<M extends MissionDefinition<any>>(
		missionId: string,
	): MissionHandle<M> | undefined;

	public abstract loadMission(missionId: string): MissionInspection | undefined;

	public abstract listWaiting(): MissionSnapshot[];

	public abstract listScheduled(): MissionSnapshot[];
}
