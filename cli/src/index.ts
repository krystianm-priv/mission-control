#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import type { MissionInspection } from "@mission-control/core";
import {
	type PgCommanderExecute,
	createPgPersistenceAdapter,
} from "@mission-control/adapter-postgres";

export function formatMissionInspection(inspection: MissionInspection): string {
	return JSON.stringify(inspection, null, 2);
}

export interface RunMissionControlCliOptions {
	args: readonly string[];
	execute: PgCommanderExecute;
	now?: Date;
}

export async function runMissionControlCli(
	options: RunMissionControlCliOptions,
): Promise<string> {
	const [command, ...rest] = options.args;
	const adapter = createPgPersistenceAdapter({ execute: options.execute });
	await adapter.bootstrap();

	if (command === "list" && rest[0] === "--waiting") {
		return `${JSON.stringify(await adapter.listWaitingSnapshots(), null, 2)}\n`;
	}

	if (command === "list" && rest[0] === "--scheduled") {
		return `${JSON.stringify(await adapter.listScheduledSnapshots(), null, 2)}\n`;
	}

	if (command === "inspect" && rest[0]) {
		const inspection = await adapter.loadInspection(rest[0]);
		return `${JSON.stringify(inspection ?? null, null, 2)}\n`;
	}

	if (command === "cancel" && rest[0]) {
		const missionId = rest[0];
		const reason = rest.slice(1).join(" ") || "Cancelled by operator.";
		await adapter.requestCancellation(missionId, reason, options.now);
		return `${JSON.stringify({ missionId, cancelled: true, reason }, null, 2)}\n`;
	}

	throw new Error(
		"Usage: mission-control list --waiting|--scheduled | inspect <missionId> | cancel <missionId> [reason]",
	);
}

async function loadExecuteFromEnvironment(): Promise<PgCommanderExecute> {
	const modulePath = process.env["MISSION_CONTROL_POSTGRES_EXECUTE_MODULE"];
	if (!modulePath) {
		throw new Error(
			"Set MISSION_CONTROL_POSTGRES_EXECUTE_MODULE to a module exporting execute(query, params?) before running the CLI.",
		);
	}
	const imported = (await import(pathToFileURL(modulePath).href)) as {
		execute?: PgCommanderExecute;
		default?: PgCommanderExecute;
	};
	const execute = imported.execute ?? imported.default;
	if (!execute) {
		throw new Error(
			"The module named by MISSION_CONTROL_POSTGRES_EXECUTE_MODULE must export execute(query, params?) or a default execute function.",
		);
	}
	return execute;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	try {
		const output = await runMissionControlCli({
			args: process.argv.slice(2),
			execute: await loadExecuteFromEnvironment(),
		});
		process.stdout.write(output);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		process.stderr.write(`${message}\n`);
		process.exitCode = 1;
	}
}
