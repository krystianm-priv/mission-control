export interface WaitTimeoutDefinition {
	afterMs: number;
	action: "fail";
	errorMessage?: string;
}

export interface NeedToOptions {
	timeout?: WaitTimeoutDefinition;
}

export interface SleepResult {
	scheduledAt: string;
	dueAt: string;
	resumedAt?: string;
}
