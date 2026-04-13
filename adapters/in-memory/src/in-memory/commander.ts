import {
	ConfigurableCommander,
	type CreateCommanderOptions,
	realClock,
} from "@mission-control/core";

export interface InMemoryCommanderOptions extends CreateCommanderOptions {}

export class InMemoryCommander extends ConfigurableCommander {
	public constructor(options: InMemoryCommanderOptions = {}) {
		const baseOptions: CreateCommanderOptions = {
			clock: options.clock ?? realClock,
		};
		if (options.createMissionId) {
			baseOptions.createMissionId = options.createMissionId;
		}
		if (options.definitions) {
			baseOptions.definitions = options.definitions;
		}
		super(baseOptions);
	}
}
