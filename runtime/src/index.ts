import {
	type CommanderPersistenceAdapter,
	type ConfigurableCommander,
	type CreateCommanderOptions,
	createCommander,
} from "@mission-control/core";

export interface CreateCommanderRuntimeOptions
	extends Omit<CreateCommanderOptions, "persistence"> {
	adapter?: CommanderPersistenceAdapter;
	identity?: string;
	taskQueue?: string;
}

export interface CommanderRuntime {
	readonly commander: ConfigurableCommander;
	identity?: string;
	taskQueue?: string;
	start(): Promise<void>;
	stop(): void;
}

export function createCommanderRuntime(
	options: CreateCommanderRuntimeOptions = {},
): CommanderRuntime {
	const commanderOptions: CreateCommanderOptions = {};
	if (options.definitions) {
		commanderOptions.definitions = options.definitions;
	}
	if (options.clock) {
		commanderOptions.clock = options.clock;
	}
	if (options.createMissionId) {
		commanderOptions.createMissionId = options.createMissionId;
	}
	if (options.adapter) {
		commanderOptions.persistence = options.adapter;
	}

	const commander = createCommander(commanderOptions);

	const runtime: CommanderRuntime = {
		commander,
		start: async () => {
			await commander.waitUntilReady();
		},
		stop: () => {
			commander.close();
		},
	};

	if (options.identity) {
		runtime.identity = options.identity;
	}

	if (options.taskQueue) {
		runtime.taskQueue = options.taskQueue;
	}

	return runtime;
}
