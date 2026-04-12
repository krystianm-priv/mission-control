export class CommanderError extends Error {
	public readonly code: string;

	public constructor(code: string, message: string) {
		super(message);
		this.name = new.target.name;
		this.code = code;
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
