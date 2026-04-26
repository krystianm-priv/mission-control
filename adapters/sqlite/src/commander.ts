import {
	type CommanderOptions,
	type CommanderPersistenceAdapter,
	ConfigurableCommander,
} from "@mission-control/core";

import { SQLiteStore } from "./store.ts";

export interface SQLitePersistenceAdapterOptions {
	databasePath: string;
}

export interface SQLiteCommanderOptions
	extends CommanderOptions,
		SQLitePersistenceAdapterOptions {}

export interface SQLitePersistenceAdapter extends CommanderPersistenceAdapter {
	listIncompleteMissionIds(): string[];
	listStartAtEntries(): Array<{ missionId: string; startAt: string }>;
}

export function createSqlitePersistenceAdapter(
	options: SQLitePersistenceAdapterOptions,
): SQLitePersistenceAdapter {
	const store = SQLiteStore.open({ databasePath: options.databasePath });
	return {
		bootstrap: () => {},
		saveInspection: (inspection) => {
			store.saveInspection(inspection);
		},
		loadInspection: (missionId) => store.loadInspection(missionId),
		listWaitingSnapshots: () => store.listWaitingSnapshots(),
		listScheduledSnapshots: () => store.listScheduledSnapshots(),
		listRecoverableInspections: () => store.listRecoverableInspections(),
		listIncompleteMissionIds: () => store.listIncompleteMissionIds(),
		listStartAtEntries: () => store.listStartAtEntries(),
		close: () => {
			store.close();
		},
	};
}

export class SQLiteCommander extends ConfigurableCommander {
	public constructor(options: SQLiteCommanderOptions) {
		const { databasePath, ...commanderOptions } = options;
		super({
			...commanderOptions,
			persistence: createSqlitePersistenceAdapter({ databasePath }),
		});
	}
}
