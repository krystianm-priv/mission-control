import type {
	CommanderCreateOptions,
	MissionHandle,
	MissionInspection,
	MissionSnapshot,
} from "./contracts.d.ts";
import {
	createEngineRuntime,
	type EngineClock,
	type EngineRuntime,
	hydrateEngineRuntime,
	inspectRuntime,
	realClock,
	recoverRuntime,
	signalRuntime,
	startRuntime,
	waitForCompletion,
} from "./engine.ts";
import type { MissionDefinition } from "./types.d.ts";

export interface CommanderOptions {
	clock?: EngineClock;
	createMissionId?: () => string;
	definitions?: MissionDefinition[];
}

export interface CommanderPersistenceAdapter {
	bootstrap?(): Promise<void> | void;
	saveInspection(inspection: MissionInspection): Promise<void> | void;
	loadInspection(
		missionId: string,
	): Promise<MissionInspection | undefined> | MissionInspection | undefined;
	listWaitingSnapshots(): Promise<MissionSnapshot[]> | MissionSnapshot[];
	listScheduledSnapshots(): Promise<MissionSnapshot[]> | MissionSnapshot[];
	listRecoverableInspections():
		| Promise<MissionInspection[]>
		| MissionInspection[];
	close?(): Promise<void> | void;
}

export interface CreateCommanderOptions extends CommanderOptions {
	persistence?: CommanderPersistenceAdapter;
}

export function createDefaultMissionId(): string {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
		return `mission-${crypto.randomUUID()}`;
	}

	return `mission-${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
}

export abstract class Commander {
	protected readonly definitions = new Map<string, MissionDefinition>();
	protected readonly clock: EngineClock;
	protected readonly missionIdFactory: () => string;

	public constructor(options: CommanderOptions = {}) {
		this.clock = options.clock ?? {
			now: () => new Date(),
			sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
		};
		this.missionIdFactory = options.createMissionId ?? createDefaultMissionId;
		for (const definition of options.definitions ?? []) {
			this.registerMission(definition);
		}
	}

	public registerMission<M extends MissionDefinition>(definition: M): this {
		this.definitions.set(definition.missionName, definition);
		return this;
	}

	protected createMissionId(): string {
		return this.missionIdFactory();
	}

	protected getRegisteredMission(name: string): MissionDefinition | undefined {
		return this.definitions.get(name);
	}

	protected getRequiredMission(name: string): MissionDefinition {
		const definition = this.getRegisteredMission(name);
		if (!definition) {
			throw new Error(
				`Mission definition "${name}" is not registered on this commander instance.`,
			);
		}
		return definition;
	}

	public abstract createMission<M extends MissionDefinition>(
		definition: M,
		options?: CommanderCreateOptions,
	): MissionHandle<M>;

	public abstract getMission<M extends MissionDefinition>(
		missionId: string,
	): Promise<MissionHandle<M> | undefined>;

	public abstract loadMission(
		missionId: string,
	): Promise<MissionInspection | undefined>;

	public abstract listWaiting(): Promise<MissionSnapshot[]>;

	public abstract listScheduled(): Promise<MissionSnapshot[]>;
}

function cloneInspection(inspection: MissionInspection): MissionInspection {
	return structuredClone(inspection);
}

class InMemoryPersistenceAdapter implements CommanderPersistenceAdapter {
	private readonly inspections = new Map<string, MissionInspection>();

	public saveInspection(inspection: MissionInspection): void {
		this.inspections.set(
			inspection.snapshot.missionId,
			cloneInspection(inspection),
		);
	}

	public loadInspection(missionId: string): MissionInspection | undefined {
		const inspection = this.inspections.get(missionId);
		return inspection ? cloneInspection(inspection) : undefined;
	}

	public listWaitingSnapshots(): MissionSnapshot[] {
		return [...this.inspections.values()]
			.filter((inspection) => inspection.snapshot.status === "waiting")
			.map((inspection) => structuredClone(inspection.snapshot));
	}

	public listScheduledSnapshots(): MissionSnapshot[] {
		return [...this.inspections.values()]
			.filter(
				(inspection) =>
					inspection.snapshot.waiting?.kind !== undefined &&
					inspection.snapshot.waiting.kind !== "signal",
			)
			.map((inspection) => structuredClone(inspection.snapshot));
	}

	public listRecoverableInspections(): MissionInspection[] {
		return [...this.inspections.values()]
			.filter(
				(inspection) =>
					inspection.snapshot.status === "waiting" ||
					inspection.snapshot.status === "running",
			)
			.map((inspection) => cloneInspection(inspection));
	}
}

export class ConfigurableCommander extends Commander {
	private readonly persistence: CommanderPersistenceAdapter;
	private readonly runtimes = new Map<string, EngineRuntime>();
	private readonly ready: Promise<void>;
	private closed = false;

	public constructor(options: CreateCommanderOptions = {}) {
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
		this.persistence = options.persistence ?? new InMemoryPersistenceAdapter();
		this.ready = this.initialize();
	}

	public close(): void {
		this.closed = true;
		for (const runtime of this.runtimes.values()) {
			runtime.scheduledToken = Symbol("configurable-commander-closed");
			runtime.persist = undefined;
		}
		void this.persistence.close?.();
	}

	public override createMission<M extends MissionDefinition>(
		definition: M,
		options: CommanderCreateOptions = {},
	): MissionHandle<M> {
		if (this.closed) {
			throw new Error("This commander instance has been closed.");
		}
		this.registerMission(definition);
		const missionId = options.missionId ?? this.createMissionId();
		const runtime = this.createPersistedRuntime(definition, missionId);
		this.runtimes.set(missionId, runtime);
		return this.createHandle(runtime);
	}

	public async start<M extends MissionDefinition>(
		definitionOrName: M | string,
		input: M["context"]["events"]["start"]["input"],
		options: CommanderCreateOptions = {},
	): Promise<MissionHandle<M>> {
		const definition =
			typeof definitionOrName === "string"
				? (this.getRequiredMission(definitionOrName) as M)
				: definitionOrName;
		const handle = this.createMission(definition, options);
		await handle.start(input);
		return handle;
	}

	public override async getMission<M extends MissionDefinition>(
		missionId: string,
	): Promise<MissionHandle<M> | undefined> {
		await this.ensureReady();

		const existing = this.runtimes.get(missionId);
		if (existing) {
			return this.createHandle(existing as EngineRuntime);
		}

		const inspection = await this.persistence.loadInspection(missionId);
		if (!inspection) {
			return undefined;
		}

		const definition = this.getRegisteredMission(
			inspection.snapshot.missionName,
		);
		if (!definition) {
			return undefined;
		}

		const runtime = this.hydratePersistedRuntime(definition, inspection);
		this.runtimes.set(missionId, runtime);
		await recoverRuntime(runtime);
		return this.createHandle(runtime as EngineRuntime);
	}

	public override async loadMission(
		missionId: string,
	): Promise<MissionInspection | undefined> {
		await this.ensureReady();
		const runtime = this.runtimes.get(missionId);
		if (runtime) {
			return inspectRuntime(runtime);
		}
		return this.persistence.loadInspection(missionId);
	}

	public override async listWaiting(): Promise<MissionSnapshot[]> {
		await this.ensureReady();
		return this.persistence.listWaitingSnapshots();
	}

	public override async listScheduled(): Promise<MissionSnapshot[]> {
		await this.ensureReady();
		return this.persistence.listScheduledSnapshots();
	}

	private async initialize(): Promise<void> {
		await this.persistence.bootstrap?.();
		await this.recoverPersistedRuntimes();
	}

	private async ensureReady(): Promise<void> {
		await this.ready;
		if (this.closed) {
			throw new Error("This commander instance has been closed.");
		}
	}

	private async recoverPersistedRuntimes(): Promise<void> {
		for (const inspection of await this.persistence.listRecoverableInspections()) {
			const definition = this.getRegisteredMission(
				inspection.snapshot.missionName,
			);
			if (!definition) {
				continue;
			}
			const runtime = this.hydratePersistedRuntime(definition, inspection);
			this.runtimes.set(inspection.snapshot.missionId, runtime);
			await recoverRuntime(runtime);
		}
	}

	private createPersistedRuntime(
		definition: MissionDefinition,
		missionId: string,
	): EngineRuntime {
		return createEngineRuntime(definition, missionId, {
			clock: this.clock,
			persist: async (activeRuntime) => {
				if (!this.closed) {
					await this.persistence.saveInspection(inspectRuntime(activeRuntime));
				}
			},
		});
	}

	private hydratePersistedRuntime(
		definition: MissionDefinition,
		inspection: MissionInspection,
	): EngineRuntime {
		return hydrateEngineRuntime(definition, inspection, {
			clock: this.clock,
			persist: async (activeRuntime) => {
				if (!this.closed) {
					await this.persistence.saveInspection(inspectRuntime(activeRuntime));
				}
			},
		});
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
				await this.ensureReady();
				await startRuntime(runtime, input);
			},
			signal: async (eventName, input) => {
				await this.ensureReady();
				await signalRuntime(runtime, eventName, input);
			},
			inspect: () => inspectRuntime(runtime),
			getHistory: () => inspectRuntime(runtime).history,
			waitForCompletion: async () => {
				await this.ensureReady();
				return waitForCompletion(runtime);
			},
		};
	}
}

export function createCommander(
	options: CreateCommanderOptions = {},
): ConfigurableCommander {
	return new ConfigurableCommander(options);
}
