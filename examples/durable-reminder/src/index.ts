import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { PgCommander } from "@mission-control/postgres-commander";

import { durableReminderMission } from "./mission-definition.ts";

const db = await PGlite.create(join(process.cwd(), ".durable-reminder-pgdata"));

const commander = new PgCommander({
	definitions: [durableReminderMission],
	execute: (query) => db.exec(query),
});

const mission = commander.createMission(durableReminderMission);

await mission.start({
	recipient: "hello@example.com",
	message: "This reminder survives a process restart through durable Postgres state.",
});

await mission.waitForCompletion();

console.log(mission.inspect());

commander.close();
await db.close();
