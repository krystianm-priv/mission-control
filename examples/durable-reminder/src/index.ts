import { createSqlitePersistenceAdapter } from "@mission-control/adapter-sqlite";
import {
	type CreateCommanderOptions,
	createCommander,
} from "@mission-control/core";

import { durableReminderMission } from "./mission-definition.ts";

export interface CreateDurableReminderCommanderOptions
	extends Omit<CreateCommanderOptions, "definitions" | "persistence"> {
	databasePath: string;
}

export function createDurableReminderCommander(
	options: CreateDurableReminderCommanderOptions,
) {
	const commanderOptions: CreateCommanderOptions = {
		definitions: [durableReminderMission],
		persistence: createSqlitePersistenceAdapter({
			databasePath: options.databasePath,
		}),
	};

	if (options.clock) {
		commanderOptions.clock = options.clock;
	}

	if (options.createMissionId) {
		commanderOptions.createMissionId = options.createMissionId;
	}

	return createCommander(commanderOptions);
}
