import {
	ConfigurableCommander,
	type CreateCommanderOptions,
} from "@mission-control/core";
import type { PgCommanderExecute } from "./sql-executor.ts";
import { PgStore } from "./store.ts";

export interface CreatePgPersistenceAdapterOptions {
	execute: PgCommanderExecute;
}

export function createPgPersistenceAdapter(
	options: CreatePgPersistenceAdapterOptions,
): PgStore {
	return new PgStore({ execute: options.execute });
}

export interface PgCommanderOptions
	extends Omit<CreateCommanderOptions, "persistence"> {
	execute: PgCommanderExecute;
}

export class PgCommander extends ConfigurableCommander {
	public constructor(options: PgCommanderOptions) {
		const commanderOptions: CreateCommanderOptions = {
			persistence: createPgPersistenceAdapter({
				execute: options.execute,
			}),
		};
		if (options.clock) {
			commanderOptions.clock = options.clock;
		}
		if (options.createMissionId) {
			commanderOptions.createMissionId = options.createMissionId;
		}
		if (options.definitions) {
			commanderOptions.definitions = options.definitions;
		}
		super(commanderOptions);
	}
}
