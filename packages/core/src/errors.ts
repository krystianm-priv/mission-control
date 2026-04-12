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
