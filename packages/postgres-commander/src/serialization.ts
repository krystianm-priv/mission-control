import type {
	MissionHistoryRecord,
	MissionSnapshot,
	SignalRecord,
	StepAttemptRecord,
	TimerRecord,
} from "@mission-control/commander";

export interface SerializedMissionState {
	snapshot: string;
	history: string;
	stepAttempts: string;
	signals: string;
	timers: string;
}

export function serializeMissionState(args: {
	snapshot: MissionSnapshot;
	history: MissionHistoryRecord[];
	stepAttempts: StepAttemptRecord[];
	signals: SignalRecord[];
	timers: TimerRecord[];
}): SerializedMissionState {
	return {
		snapshot: JSON.stringify(args.snapshot),
		history: JSON.stringify(args.history),
		stepAttempts: JSON.stringify(args.stepAttempts),
		signals: JSON.stringify(args.signals),
		timers: JSON.stringify(args.timers),
	};
}

export function deserializeMissionState(payload: SerializedMissionState): {
	snapshot: MissionSnapshot;
	history: MissionHistoryRecord[];
	stepAttempts: StepAttemptRecord[];
	signals: SignalRecord[];
	timers: TimerRecord[];
} {
	return {
		snapshot: JSON.parse(payload.snapshot) as MissionSnapshot,
		history: JSON.parse(payload.history) as MissionHistoryRecord[],
		stepAttempts: JSON.parse(payload.stepAttempts) as StepAttemptRecord[],
		signals: JSON.parse(payload.signals) as SignalRecord[],
		timers: JSON.parse(payload.timers) as TimerRecord[],
	};
}
