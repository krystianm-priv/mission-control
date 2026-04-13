import {
	Commander,
	type CommanderCreateOptions,
	type CommanderOptions,
	createEngineRuntime,
	type EngineRuntime,
	hydrateEngineRuntime,
	inspectRuntime,
	type MissionDefinition,
	type MissionHandle,
	type MissionInspection,
	type MissionSnapshot,
	recoverRuntime,
	signalRuntime,
	startRuntime,
	waitForCompletion,
} from "@mission-control/core";

import { SQLiteStore } from "./store.ts";

export interface SQLiteCommanderOptions extends CommanderOptions {
	databasePath: string;
}

export class SQLiteCommander extends Commander {
	private readonly store: SQLiteStore;
	private readonly runtimes = new Map<string, EngineRuntime>();
	private closed = false;

	public constructor(options: SQLiteCommanderOptions) {
		super(options);
		this.store = SQLiteStore.open({ databasePath: options.databasePath });
		this.recoverPersistedRuntimes();
	}

	public close(): void {
		this.closed = true;
		for (const runtime of this.runtimes.values()) {
			runtime.scheduledToken = Symbol("sqlite-commander-closed");
			runtime.persist = undefined;
		}
		this.store.close();
	}

	public override createMission<M extends MissionDefinition>(
		definition: M,
		options: CommanderCreateOptions = {},
	): MissionHandle<M> {
		this.ensureOpen();
		this.registerMission(definition);
		const missionId = options.missionId ?? this.createMissionId();
		const runtime = this.createPersistedRuntime(definition, missionId);
		this.runtimes.set(missionId, runtime);
		this.store.saveInspection(inspectRuntime(runtime));
		return this.createHandle(runtime);
	}

	public override async getMission<M extends MissionDefinition>(
		missionId: string,
	): Promise<MissionHandle<M> | undefined> {
		this.ensureOpen();
		const existing = this.runtimes.get(missionId);
		if (existing) {
			return this.createHandle(existing as EngineRuntime);
		}

		const inspection = await this.store.loadInspection(missionId);
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
		void recoverRuntime(runtime);
		return this.createHandle(runtime as EngineRuntime);
	}

	public override async loadMission(
		missionId: string,
	): Promise<MissionInspection | undefined> {
		this.ensureOpen();
		return this.store.loadInspection(missionId);
	}

	public override async listWaiting(): Promise<MissionSnapshot[]> {
		this.ensureOpen();
		return this.store.listWaitingSnapshots();
	}

	public override async listScheduled(): Promise<MissionSnapshot[]> {
		this.ensureOpen();
		return this.store.listScheduledSnapshots();
	}

	private ensureOpen(): void {
		if (this.closed) {
			throw new Error("This SQLiteCommander instance has been closed.");
		}
	}

	private recoverPersistedRuntimes(): void {
		for (const inspection of this.store.listRecoverableInspections()) {
			const definition = this.getRegisteredMission(
				inspection.snapshot.missionName,
			);
			if (!definition) {
				continue;
			}
			const runtime = this.hydratePersistedRuntime(definition, inspection);
			this.runtimes.set(inspection.snapshot.missionId, runtime);
			void recoverRuntime(runtime);
		}
	}

	private createPersistedRuntime(
		definition: MissionDefinition,
		missionId: string,
	): EngineRuntime {
		return createEngineRuntime(definition, missionId, {
			clock: this.clock,
			persist: (activeRuntime) => {
				this.store.saveInspection(inspectRuntime(activeRuntime));
			},
		});
	}

	private hydratePersistedRuntime(
		definition: MissionDefinition,
		inspection: MissionInspection,
	): EngineRuntime {
		return hydrateEngineRuntime(definition, inspection, {
			clock: this.clock,
			persist: (activeRuntime) => {
				this.store.saveInspection(inspectRuntime(activeRuntime));
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
				this.ensureOpen();
				await startRuntime(runtime, input);
			},
			signal: async (eventName, input) => {
				this.ensureOpen();
				await signalRuntime(runtime, eventName, input);
			},
			inspect: () => inspectRuntime(runtime),
			getHistory: () => inspectRuntime(runtime).history,
			waitForCompletion: async () => {
				this.ensureOpen();
				return waitForCompletion(runtime);
			},
		};
	}
}
