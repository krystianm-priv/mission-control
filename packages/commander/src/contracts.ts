import type { MissionDefinition } from "@mission-control/core";

export type MissionStatus =
	| "idle"
	| "running"
	| "waiting"
	| "completed"
	| "failed";

/**
 * idle: mission exists but its start event has not run.
 * running: the engine is actively interpreting nodes.
 * waiting: the mission is paused on an external signal or timer.
 * completed: the mission reached its terminal end node successfully.
 * failed: the mission reached a terminal error state.
 */
export interface MissionSnapshot {
	missionId: string;
	missionName: string;
	status: MissionStatus;
	cursor: number;
	error:
		| {
				message: string;
				code?: string;
				stack?: string;
		  }
		| undefined;
	ctx: {
		missionId: string;
		events: Record<string, { input?: unknown; output?: unknown }>;
	};
	waiting: MissionWaitingState | undefined;
}

export interface MissionWaitingState {
	kind: "signal" | "timer";
	eventName: string;
	nodeIndex: number;
	timeoutAt?: string;
	timerDueAt?: string;
}

export interface StepAttemptRecord {
	stepName: string;
	attemptNumber: number;
	startedAt: string;
	finishedAt?: string;
	status: "running" | "succeeded" | "failed";
	error?: string;
}

export interface SignalRecord {
	eventName: string;
	receivedAt: string;
	payload: unknown;
}

export interface TimerRecord {
	eventName: string;
	scheduledAt: string;
	dueAt: string;
	resumedAt?: string;
	status: "scheduled" | "completed" | "cancelled";
}

export interface MissionHistoryRecord {
	type:
		| "mission-created"
		| "mission-started"
		| "step-succeeded"
		| "step-failed"
		| "step-retry-scheduled"
		| "waiting-for-signal"
		| "signal-received"
		| "timer-scheduled"
		| "timer-fired"
		| "mission-completed"
		| "mission-failed";
	at: string;
	eventName?: string;
	attemptNumber?: number;
	details?: Record<string, unknown>;
}

export interface MissionInspection {
	snapshot: MissionSnapshot;
	history: MissionHistoryRecord[];
	stepAttempts: StepAttemptRecord[];
	signals: SignalRecord[];
	timers: TimerRecord[];
}

export interface CommanderCreateOptions {
	missionId?: string;
}

export interface CommanderStartOptions {
	idempotencyKey?: string;
}

export interface CommanderSignalOptions {
	idempotencyKey?: string;
}

export interface MissionHandle<M extends MissionDefinition<any>> {
	readonly missionId: string;
	readonly missionName: M["missionName"];
	readonly status: MissionStatus;
	readonly error: MissionSnapshot["error"];
	readonly ctx: MissionSnapshot["ctx"];
	start(input: M["context"]["events"]["start"]["input"]): Promise<void>;
	startMission(input: M["context"]["events"]["start"]["input"]): Promise<void>;
	signal<E extends keyof M["context"]["events"] & string>(
		eventName: E,
		input: M["context"]["events"][E] extends { input: infer Input }
			? Input
			: never,
	): Promise<void>;
	inspect(): MissionInspection;
	getHistory(): MissionHistoryRecord[];
	waitForCompletion(): Promise<MissionSnapshot>;
}

export interface Commander<M extends MissionDefinition<any> = MissionDefinition<any>> {
	createMission(definition: M, options?: CommanderCreateOptions): MissionHandle<M>;
	loadMission(missionId: string): MissionInspection | undefined;
	listWaiting(): MissionSnapshot[];
	listScheduled(): MissionSnapshot[];
}
