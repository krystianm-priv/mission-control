import { createCommander } from "@mission-control/core";
import {
	createPgPersistenceAdapter,
	type PgCommanderExecute,
} from "@mission-control/adapter-postgres";

import { durableReminderMission } from "./mission-definition.ts";

export function createDurableReminderCommander(execute: PgCommanderExecute) {
	return createCommander({
		definitions: [durableReminderMission],
		persistence: createPgPersistenceAdapter({ execute }),
	});
}
