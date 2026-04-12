import { join } from "node:path";

import { SQLiteCommander } from "@mission-control/sqlite-commander";

import { durableReminderMission } from "./mission-definition.ts";

const databasePath = join(process.cwd(), "durable-reminder.sqlite");

const commander = new SQLiteCommander({
	databasePath,
	definitions: [durableReminderMission],
});

const mission = commander.createMission(durableReminderMission);

await mission.start({
	recipient: "hello@example.com",
	message: "This reminder survives a process restart through SQLite state.",
});

await mission.waitForCompletion();

console.log(mission.inspect());
commander.close();
