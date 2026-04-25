import type { MissionDefinition } from "./types.d.ts";

export type MissionStatus =
	| "idle"
	| "running"
	| "waiting"
	| "completed"
	| "failed"
	| "cancelled";

/**
 * idle: mission exists but its start event has not run.
 * running: the engine is actively interpreting nodes.
 * waiting: the mission is paused on an external signal, sleep timer, or retry backoff timer.
 * completed: the mission reached its terminal end node successfully.
 * failed: the mission reached a terminal error state.
 * cancelled: the mission was explicitly cancelled before normal completion.
 */
export interface MissionSnapshot {
	missionId: string;
	missionName: string;
	status: MissionStatus;
	cursor: number;
	error: MissionFailure | undefined;
	ctx: {
		missionId: string;
		events: Record<string, { input?: unknown; output?: unknown }>;
	};
	waiting: MissionWaitingState | undefined;
}

export interface MissionFailure {
	message: string;
	at: string;
	code?: string;
	stack?: string;
}

export interface SignalWaitingState {
	kind: "signal";
	eventName: string;
	nodeIndex: number;
	timeoutAt?: string;
}

export interface TimerWaitingState {
	kind: "timer";
	eventName: string;
	nodeIndex: number;
	timerDueAt: string;
}

export interface RetryWaitingState {
	kind: "retry";
	eventName: string;
	nodeIndex: number;
	timerDueAt: string;
}

export type MissionWaitingState =
	| SignalWaitingState
	| TimerWaitingState
	| RetryWaitingState;

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
	kind: "sleep" | "retry";
	scheduledAt: string;
	dueAt: string;
	resumedAt?: string;
	status: "scheduled" | "completed" | "cancelled";
}

export interface MissionHistoryRecord {
	type:
		| "mission-created"
		| "mission-started"
		| "mission-query"
		| "mission-update"
		| "step-succeeded"
		| "step-failed"
		| "step-retry-scheduled"
		| "waiting-for-signal"
		| "signal-received"
		| "timer-scheduled"
		| "timer-fired"
		| "mission-cancellation-requested"
		| "mission-cancelled"
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

export type RecoverableMissionStatus = Extract<
	MissionStatus,
	"waiting" | "running"
>;
export type ScheduledMissionWaitKind = (
	| TimerWaitingState
	| RetryWaitingState
)["kind"];

export interface WaitingMissionSnapshot extends MissionSnapshot {
	status: "waiting";
	waiting: MissionWaitingState;
}

export interface ScheduledMissionSnapshot extends WaitingMissionSnapshot {
	waiting: TimerWaitingState | RetryWaitingState;
}

export interface RecoverableMissionInspection extends MissionInspection {
	snapshot: MissionSnapshot & {
		status: RecoverableMissionStatus;
	};
}

export interface CommanderCreateOptions {
	missionId?: string;
}

export interface MissionHandle<M extends MissionDefinition> {
	readonly missionId: string;
	readonly missionName: M["missionName"];
	readonly status: MissionStatus;
	readonly error: MissionSnapshot["error"];
	readonly ctx: MissionSnapshot["ctx"];
	start(input: M["context"]["events"]["start"]["input"]): Promise<void>;
	signal<E extends keyof M["context"]["events"] & string>(
		eventName: E,
		input: M["context"]["events"][E] extends { input: infer Input }
			? Input
			: never,
	): Promise<void>;
	query?(name: string): Promise<unknown>;
	update?(name: string, input: unknown): Promise<unknown>;
	cancel(reason?: string): Promise<MissionSnapshot>;
	inspect(): MissionInspection;
	getHistory(): MissionHistoryRecord[];
	result?(): Promise<MissionSnapshot>;
	waitForCompletion(): Promise<MissionSnapshot>;
}
