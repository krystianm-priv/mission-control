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
import type { PgCommanderExecute } from "./sql-executor.ts";
import { PgStore } from "./store.ts";

export interface PgCommanderOptions extends CommanderOptions {
	execute: PgCommanderExecute;
}

export class PgCommander extends Commander {
	private readonly store: PgStore;
	private readonly runtimes = new Map<string, EngineRuntime>();
	private readonly ready: Promise<void>;
	private closed = false;

	public constructor(options: PgCommanderOptions) {
		super(options);
		this.store = new PgStore({ execute: options.execute });
		this.ready = this.initialize();
	}

	public close(): void {
		this.closed = true;
		for (const runtime of this.runtimes.values()) {
			runtime.scheduledToken = Symbol("postgres-commander-closed");
			runtime.persist = undefined;
		}
	}

	public override createMission<M extends MissionDefinition>(
		definition: M,
		options: CommanderCreateOptions = {},
	): MissionHandle<M> {
		if (this.closed) {
			throw new Error("This PgCommander instance has been closed.");
		}
		this.registerMission(definition);
		const missionId = options.missionId ?? this.createMissionId();
		const runtime = this.createPersistedRuntime(definition, missionId);
		this.runtimes.set(missionId, runtime);
		return this.createHandle(runtime);
	}

	public override async getMission<M extends MissionDefinition>(
		missionId: string,
	): Promise<MissionHandle<M> | undefined> {
		await this.ensureReady();

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
		await recoverRuntime(runtime);
		return this.createHandle(runtime as EngineRuntime);
	}

	public override async loadMission(
		missionId: string,
	): Promise<MissionInspection | undefined> {
		await this.ensureReady();
		return this.store.loadInspection(missionId);
	}

	public override async listWaiting(): Promise<MissionSnapshot[]> {
		await this.ensureReady();
		return this.store.listWaitingSnapshots();
	}

	public override async listScheduled(): Promise<MissionSnapshot[]> {
		await this.ensureReady();
		return this.store.listScheduledSnapshots();
	}

	private async initialize(): Promise<void> {
		await this.store.bootstrap();
		await this.recoverPersistedRuntimes();
	}

	private async ensureReady(): Promise<void> {
		await this.ready;
		if (this.closed) {
			throw new Error("This PgCommander instance has been closed.");
		}
	}

	private async recoverPersistedRuntimes(): Promise<void> {
		for (const inspection of await this.store.listRecoverableInspections()) {
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
					await this.store.saveInspection(inspectRuntime(activeRuntime));
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
					await this.store.saveInspection(inspectRuntime(activeRuntime));
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
