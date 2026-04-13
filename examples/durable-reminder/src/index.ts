import {
	createPgPersistenceAdapter,
	type PgCommanderExecute,
} from "@mission-control/adapter-postgres";
import {
	type CreateCommanderOptions,
	createCommander,
} from "@mission-control/core";

import { durableReminderMission } from "./mission-definition.ts";

export interface CreateDurableReminderCommanderOptions
	extends Omit<CreateCommanderOptions, "definitions" | "persistence"> {}

export function createDurableReminderCommander(
	execute: PgCommanderExecute,
	options: CreateDurableReminderCommanderOptions = {},
) {
	const commanderOptions: CreateCommanderOptions = {
		definitions: [durableReminderMission],
		persistence: createPgPersistenceAdapter({ execute }),
	};

	if (options.clock) {
		commanderOptions.clock = options.clock;
	}

	if (options.createMissionId) {
		commanderOptions.createMissionId = options.createMissionId;
	}

	return createCommander(commanderOptions);
}
