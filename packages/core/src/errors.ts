export class MissionControlError extends Error {
	public readonly code: string;

	public constructor(code: string, message: string) {
		super(message);
		this.name = new.target.name;
		this.code = code;
	}
}

export class MissionValidationError extends MissionControlError {
	public readonly eventName: string;
	public readonly issues: unknown;

	public constructor(eventName: string, issues: unknown) {
		super("MISSION_VALIDATION_ERROR", `Invalid input for event "${eventName}".`);
		this.eventName = eventName;
		this.issues = issues;
	}
}

export class MissionDefinitionError extends MissionControlError {
	public constructor(message: string) {
		super("MISSION_DEFINITION_ERROR", message);
	}
}

export class CommanderError extends MissionControlError {
	public constructor(code: string, message: string) {
		super(code, message);
	}
}

export class MissionAlreadyStartedError extends CommanderError {
	public constructor(status: string) {
		super(
			"MISSION_ALREADY_STARTED",
			`Mission already started or terminated (status=${status}).`,
		);
	}
}

export class MissionSignalError extends CommanderError {
	public constructor(message: string) {
		super("MISSION_SIGNAL_ERROR", message);
	}
}

export class MissionExecutionError extends CommanderError {
	public constructor(message: string) {
		super("MISSION_EXECUTION_ERROR", message);
	}
}
