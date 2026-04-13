import {
	PgCommander,
	type PgCommanderExecute,
} from "@mission-control/postgres-commander";

import { durableReminderMission } from "./mission-definition.ts";

export function createDurableReminderCommander(execute: PgCommanderExecute) {
	return new PgCommander({
		definitions: [durableReminderMission],
		execute,
	});
}
