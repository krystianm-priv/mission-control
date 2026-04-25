#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import type { MissionInspection } from "@mission-control/core";

export function formatMissionInspection(inspection: MissionInspection): string {
	return JSON.stringify(inspection, null, 2);
}

export interface RunMissionControlCliOptions {
	args: readonly string[];
}

export async function runMissionControlCli(
	_options: RunMissionControlCliOptions,
): Promise<string> {
	throw new Error("@mission-control/cli is unsupported in the v1 MVP build.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	try {
		const output = await runMissionControlCli({
			args: process.argv.slice(2),
		});
		process.stdout.write(output);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		process.stderr.write(`${message}\n`);
		process.exitCode = 1;
	}
}
