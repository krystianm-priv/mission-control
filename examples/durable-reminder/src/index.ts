import {
	SQLiteCommander,
	type SQLiteCommanderOptions,
} from "@mission-control/adapter-sqlite";

import { durableReminderMission } from "./mission-definition.ts";

export interface CreateDurableReminderCommanderOptions
	extends Omit<SQLiteCommanderOptions, "definitions"> {
	databasePath: string;
}

export function createDurableReminderCommander(
	options: CreateDurableReminderCommanderOptions,
) {
	const commanderOptions: SQLiteCommanderOptions = {
		definitions: [durableReminderMission],
		databasePath: options.databasePath,
	};

	if (options.clock) {
		commanderOptions.clock = options.clock;
	}

	if (options.createMissionId) {
		commanderOptions.createMissionId = options.createMissionId;
	}

	return new SQLiteCommander(commanderOptions);
}
