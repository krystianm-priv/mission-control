import {
	Commander,
	createEngineRuntime,
	hydrateEngineRuntime,
	inspectRuntime,
	recoverRuntime,
	signalRuntime,
	startRuntime,
	waitForCompletion,
	type CommanderCreateOptions,
	type CommanderOptions,
	type EngineRuntime,
	type MissionDefinition,
	type MissionHandle,
	type MissionInspection,
	type MissionSnapshot,
} from "@mission-control/core";

import { SQLiteStore } from "./store.js";

export interface SQLiteCommanderOptions extends CommanderOptions {
	databasePath: string;
}

export class SQLiteCommander extends Commander {
	private readonly store: SQLiteStore;
	private readonly runtimes = new Map<string, EngineRuntime>();

	public constructor(options: SQLiteCommanderOptions) {
		super(options);
		this.store = SQLiteStore.open({ databasePath: options.databasePath });
		this.recoverPersistedRuntimes();
	}

	public close(): void {
		for (const runtime of this.runtimes.values()) {
			runtime.scheduledToken = Symbol("sqlite-commander-closed");
			runtime.persist = undefined;
		}
		this.store.close();
	}

	public override createMission<M extends MissionDefinition<any>>(
		definition: M,
		options: CommanderCreateOptions = {},
	): MissionHandle<M> {
		this.registerMission(definition);
		const missionId = options.missionId ?? this.createMissionId();
		const runtime = this.createPersistedRuntime(definition, missionId);
		this.runtimes.set(missionId, runtime);
		this.store.saveInspection(inspectRuntime(runtime));
		return this.createHandle(runtime);
	}

	public override getMission<M extends MissionDefinition<any>>(
		missionId: string,
	): MissionHandle<M> | undefined {
		const existing = this.runtimes.get(missionId);
		if (existing) {
			return this.createHandle(existing as EngineRuntime);
		}

		const inspection = this.store.loadInspection(missionId);
		if (!inspection) {
			return undefined;
		}

		const definition = this.getRegisteredMission(inspection.snapshot.missionName);
		if (!definition) {
			return undefined;
		}

		const runtime = this.hydratePersistedRuntime(definition, inspection);
		this.runtimes.set(missionId, runtime);
		void recoverRuntime(runtime);
		return this.createHandle(runtime as EngineRuntime);
	}

	public override loadMission(missionId: string): MissionInspection | undefined {
		return this.store.loadInspection(missionId);
	}

	public override listWaiting(): MissionSnapshot[] {
		return this.store.listWaitingSnapshots();
	}

	public override listScheduled(): MissionSnapshot[] {
		return this.store.listScheduledSnapshots();
	}

	private recoverPersistedRuntimes(): void {
		for (const inspection of this.store.listRecoverableInspections()) {
			const definition = this.getRegisteredMission(inspection.snapshot.missionName);
			if (!definition) {
				continue;
			}
			const runtime = this.hydratePersistedRuntime(definition, inspection);
			this.runtimes.set(inspection.snapshot.missionId, runtime);
			void recoverRuntime(runtime);
		}
	}

	private createPersistedRuntime(
		definition: MissionDefinition<any>,
		missionId: string,
	): EngineRuntime {
		let runtime!: EngineRuntime;
		runtime = createEngineRuntime(definition, missionId, {
			clock: this.clock,
			persist: (activeRuntime) => {
				this.store.saveInspection(inspectRuntime(activeRuntime));
			},
		});
		return runtime;
	}

	private hydratePersistedRuntime(
		definition: MissionDefinition<any>,
		inspection: MissionInspection,
	): EngineRuntime {
		let runtime!: EngineRuntime;
		runtime = hydrateEngineRuntime(definition, inspection, {
			clock: this.clock,
			persist: (activeRuntime) => {
				this.store.saveInspection(inspectRuntime(activeRuntime));
			},
		});
		return runtime;
	}

	private createHandle<M extends MissionDefinition<any>>(
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
