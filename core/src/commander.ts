import type {
	CommanderCreateOptions,
	MissionHandle,
	MissionInspection,
	MissionSnapshot,
	RecoverableMissionInspection,
	ScheduledMissionSnapshot,
	WaitingMissionSnapshot,
} from "./contracts.d.ts";
import {
	cancelRuntime,
	createEngineRuntime,
	type EngineClock,
	type EngineRuntime,
	enqueueRuntimeOperation,
	hydrateEngineRuntime,
	inspectRuntime,
	realClock,
	recoverRuntime,
	resultRuntime,
	signalRuntime,
	startRuntime,
	waitForCompletion,
} from "./engine.ts";
import { CommanderError } from "./errors.ts";
import { parseMissionInput } from "./schema.ts";
import type { MissionDefinition } from "./types.d.ts";

export interface CommanderOptions {
	clock?: EngineClock;
	createMissionId?: () => string;
	definitions?: MissionDefinition[];
}

export interface CommanderPersistenceAdapter {
	/**
	 * Optional startup hook used to prepare backend state before recovery begins.
	 */
	bootstrap?(): Promise<void> | void;
	/**
	 * Persist the latest full mission inspection after runtime state changes.
	 */
	saveInspection(inspection: MissionInspection): Promise<void> | void;
	/**
	 * Load the full persisted inspection for one mission identifier.
	 */
	loadInspection(
		missionId: string,
	): Promise<MissionInspection | undefined> | MissionInspection | undefined;
	/**
	 * List waiting missions for inspection APIs. Returned snapshots must include
	 * explicit waiting metadata.
	 */
	listWaitingSnapshots():
		| Promise<WaitingMissionSnapshot[]>
		| WaitingMissionSnapshot[];
	/**
	 * List the subset of waiting missions blocked on a timer or retry backoff.
	 */
	listScheduledSnapshots():
		| Promise<ScheduledMissionSnapshot[]>
		| ScheduledMissionSnapshot[];
	/**
	 * List persisted inspections that should be rehydrated during startup.
	 */
	listRecoverableInspections():
		| Promise<RecoverableMissionInspection[]>
		| RecoverableMissionInspection[];
	requestCancellation?(
		missionId: string,
		reason?: string,
	): Promise<void> | void;
	close?(): void;
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

export function isWaitingMissionSnapshot(
	snapshot: MissionSnapshot,
): snapshot is WaitingMissionSnapshot {
	return snapshot.status === "waiting" && snapshot.waiting !== undefined;
}

export function isScheduledMissionSnapshot(
	snapshot: MissionSnapshot,
): snapshot is ScheduledMissionSnapshot {
	return (
		isWaitingMissionSnapshot(snapshot) && snapshot.waiting.kind !== "signal"
	);
}

export function isRecoverableMissionInspection(
	inspection: MissionInspection,
): inspection is RecoverableMissionInspection {
	return (
		inspection.snapshot.status === "waiting" ||
		inspection.snapshot.status === "running"
	);
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

	public abstract cancelMission(
		missionId: string,
		reason?: string,
	): Promise<MissionSnapshot>;

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

	public listWaitingSnapshots(): WaitingMissionSnapshot[] {
		return [...this.inspections.values()]
			.map((inspection) => structuredClone(inspection.snapshot))
			.filter(isWaitingMissionSnapshot);
	}

	public listScheduledSnapshots(): ScheduledMissionSnapshot[] {
		return [...this.inspections.values()]
			.map((inspection) => structuredClone(inspection.snapshot))
			.filter(isScheduledMissionSnapshot);
	}

	public listRecoverableInspections(): RecoverableMissionInspection[] {
		return [...this.inspections.values()]
			.map((inspection) => cloneInspection(inspection))
			.filter(isRecoverableMissionInspection);
	}
}

export class ConfigurableCommander extends Commander {
	private readonly persistence: CommanderPersistenceAdapter;
	private readonly runtimes = new Map<string, EngineRuntime>();
	private readonly pendingHydrations = new Map<
		string,
		Promise<EngineRuntime | undefined>
	>();
	private readonly ready: Promise<void>;
	private initialized = false;
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
		const initialization = this.initialize();
		if (isPromiseLike(initialization)) {
			this.ready = initialization.then(() => {
				this.initialized = true;
			});
		} else {
			this.initialized = true;
			this.ready = Promise.resolve();
		}
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
		if (!this.initialized) {
			throw new Error(
				"This commander is still initializing. Await waitUntilReady() before calling createMission().",
			);
		}
		this.registerMission(definition);
		const missionId = options.missionId ?? this.createMissionId();
		if (this.runtimes.has(missionId)) {
			throw new CommanderError(
				"MISSION_ALREADY_EXISTS",
				`A mission with ID "${missionId}" already exists.`,
			);
		}
		const existing = this.persistence.loadInspection(missionId);
		if (!isPromiseLike(existing) && existing) {
			throw new CommanderError(
				"MISSION_ALREADY_EXISTS",
				`A mission with ID "${missionId}" already exists.`,
			);
		}
		const runtime = this.createPersistedRuntime(definition, missionId);
		this.runtimes.set(missionId, runtime);
		return this.createHandle(runtime);
	}

	public async start<M extends MissionDefinition>(
		definitionOrName: M | string,
		input: M["context"]["events"]["start"]["input"],
		options: CommanderCreateOptions = {},
	): Promise<MissionHandle<M>> {
		await this.ensureReady();
		const definition =
			typeof definitionOrName === "string"
				? (this.getRequiredMission(definitionOrName) as M)
				: definitionOrName;
		const missionId = options.missionId ?? this.createMissionId();
		await this.assertMissionIdAvailable(missionId);
		const handle = this.createMission(definition, { missionId });
		await handle.start(input);
		return handle;
	}

	public async waitUntilReady(): Promise<void> {
		await this.ensureReady();
	}

	public override async getMission<M extends MissionDefinition>(
		missionId: string,
	): Promise<MissionHandle<M> | undefined> {
		await this.ensureReady();

		const existing = this.runtimes.get(missionId);
		if (existing) {
			return this.createHandle(existing as EngineRuntime);
		}

		const runtime = await this.getOrHydrateRuntime(missionId);
		if (!runtime) {
			return undefined;
		}
		return this.createHandle(runtime as EngineRuntime);
	}

	public override async cancelMission(
		missionId: string,
		reason?: string,
	): Promise<MissionSnapshot> {
		await this.ensureReady();
		let runtime = this.runtimes.get(missionId);
		if (!runtime) {
			runtime = await this.getOrHydrateRuntime(missionId);
			if (!runtime) {
				throw new Error(`Mission "${missionId}" was not found.`);
			}
		}
		await this.persistence.requestCancellation?.(missionId, reason);
		return cancelRuntime(runtime, reason);
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

	private initialize(): Promise<void> | void {
		const bootstrap = this.persistence.bootstrap?.();
		if (isPromiseLike(bootstrap)) {
			return bootstrap.then(() => this.recoverPersistedRuntimes());
		}
		return this.recoverPersistedRuntimes();
	}

	private async ensureReady(): Promise<void> {
		await this.ready;
		if (this.closed) {
			throw new Error("This commander instance has been closed.");
		}
	}

	private async assertMissionIdAvailable(missionId: string): Promise<void> {
		if (this.runtimes.has(missionId)) {
			throw new CommanderError(
				"MISSION_ALREADY_EXISTS",
				`A mission with ID "${missionId}" already exists.`,
			);
		}
		const persisted = await this.persistence.loadInspection(missionId);
		if (persisted) {
			throw new CommanderError(
				"MISSION_ALREADY_EXISTS",
				`A mission with ID "${missionId}" already exists.`,
			);
		}
	}

	private async getOrHydrateRuntime(
		missionId: string,
	): Promise<EngineRuntime | undefined> {
		const existing = this.runtimes.get(missionId);
		if (existing) {
			return existing;
		}

		const pending = this.pendingHydrations.get(missionId);
		if (pending) {
			return pending;
		}

		const hydration = this.hydrateRuntimeFromPersistence(missionId);
		this.pendingHydrations.set(missionId, hydration);
		try {
			return await hydration;
		} finally {
			this.pendingHydrations.delete(missionId);
		}
	}

	private async hydrateRuntimeFromPersistence(
		missionId: string,
	): Promise<EngineRuntime | undefined> {
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
		return runtime;
	}

	private recoverPersistedRuntimes(): Promise<void> | void {
		const inspections = this.persistence.listRecoverableInspections();
		if (isPromiseLike(inspections)) {
			return inspections.then((resolved) =>
				this.recoverPersistedInspections(resolved),
			);
		}
		return this.recoverPersistedInspections(inspections);
	}

	private recoverPersistedInspections(
		inspections: RecoverableMissionInspection[],
	): Promise<void> | void {
		let recovery: Promise<void> | undefined;
		for (const inspection of inspections) {
			const definition = this.getRegisteredMission(
				inspection.snapshot.missionName,
			);
			if (!definition) {
				continue;
			}
			const runtime = this.hydratePersistedRuntime(definition, inspection);
			this.runtimes.set(inspection.snapshot.missionId, runtime);
			if (recovery) {
				recovery = recovery.then(() => recoverRuntime(runtime));
				continue;
			}
			const pendingRecovery = recoverRuntime(runtime);
			recovery = isPromiseLike(pendingRecovery)
				? pendingRecovery
				: Promise.resolve();
		}
		return recovery;
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
			query: async (name) => {
				await this.ensureReady();
				return enqueueRuntimeOperation(runtime, async () => {
					const query = runtime.definition.queries.find(
						(candidate) => candidate.name === name,
					);
					if (!query) {
						throw new Error(
							`Mission query "${name}" is not registered on "${runtime.definition.missionName}".`,
						);
					}
					const inspection = inspectRuntime(runtime);
					const output = await query.run({
						ctx: inspection.snapshot.ctx,
						inspection,
					});
					runtime.history.push({
						type: "mission-query",
						at: this.clock.now().toISOString(),
						eventName: name,
					});
					await runtime.persist?.(runtime);
					return output;
				});
			},
			update: async (name, input) => {
				await this.ensureReady();
				return enqueueRuntimeOperation(runtime, async () => {
					if (
						runtime.snapshot.status === "completed" ||
						runtime.snapshot.status === "failed" ||
						runtime.snapshot.status === "cancelled"
					) {
						throw new Error(
							`Mission "${runtime.snapshot.missionId}" is already terminal and cannot accept updates.`,
						);
					}
					const update = runtime.definition.updates.find(
						(candidate) => candidate.name === name,
					);
					if (!update) {
						throw new Error(
							`Mission update "${name}" is not registered on "${runtime.definition.missionName}".`,
						);
					}
					const parsedInput = parseMissionInput(
						name,
						update.inputSchema,
						input,
					);
					const output = await update.run({
						ctx: runtime.snapshot.ctx,
						input: parsedInput,
						inspection: inspectRuntime(runtime),
					});
					runtime.snapshot.ctx.events[name] = {
						input: parsedInput,
						output,
					};
					runtime.history.push({
						type: "mission-update",
						at: this.clock.now().toISOString(),
						eventName: name,
					});
					await runtime.persist?.(runtime);
					return output;
				});
			},
			cancel: async (reason) => {
				await this.ensureReady();
				await this.persistence.requestCancellation?.(
					runtime.snapshot.missionId,
					reason,
				);
				return cancelRuntime(runtime, reason);
			},
			inspect: () => inspectRuntime(runtime),
			getHistory: () => inspectRuntime(runtime).history,
			result: async () => {
				await this.ensureReady();
				return resultRuntime(runtime);
			},
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

function isPromiseLike<T>(
	value: Promise<T> | PromiseLike<T> | T | undefined,
): value is Promise<T> | PromiseLike<T> {
	return (
		typeof value === "object" &&
		value !== null &&
		"then" in value &&
		typeof value.then === "function"
	);
}
