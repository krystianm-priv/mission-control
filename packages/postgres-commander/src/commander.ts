import type { MissionDefinition } from "@mission-control/core";
import type {
	CommanderCreateOptions,
	MissionHandle,
	MissionInspection,
	MissionSnapshot,
} from "@mission-control/commander";

import { PostgresStore } from "./store.js";

export interface PostgresCommanderOptions {
	store: PostgresStore;
}

export class PostgresCommander {
	public constructor(private readonly options: PostgresCommanderOptions) {}

	public createMission<M extends MissionDefinition<any>>(
		_definition: M,
		_options?: CommanderCreateOptions,
	): MissionHandle<M> {
		throw new Error(
			"PostgresCommander mission execution requires a live Postgres client and is not validated in this environment.",
		);
	}

	public async loadMission(_missionId: string): Promise<MissionInspection | undefined> {
		void this.options.store;
		return undefined;
	}

	public async listWaiting(): Promise<MissionSnapshot[]> {
		return [];
	}

	public async listScheduled(): Promise<MissionSnapshot[]> {
		return [];
	}
}
