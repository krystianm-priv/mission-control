import type { MissionInspection } from "@mission-control/core";

export interface SerializedInspectionRow {
	mission_id: string;
	mission_name: string;
	status: string;
	cursor: number;
	waiting_kind: string | null;
	waiting_event_name: string | null;
	waiting_node_index: number | null;
	timeout_at: string | null;
	timer_due_at: string | null;
	error_json: string | null;
	ctx_json: string;
	history_json: string;
	step_attempts_json: string;
	signals_json: string;
	timers_json: string;
	created_at: string;
	updated_at: string;
}

export function serializeInspection(
	inspection: MissionInspection,
	createdAt?: string,
): SerializedInspectionRow {
	const now = new Date().toISOString();
	const waiting = inspection.snapshot.waiting;
	return {
		mission_id: inspection.snapshot.missionId,
		mission_name: inspection.snapshot.missionName,
		status: inspection.snapshot.status,
		cursor: inspection.snapshot.cursor,
		waiting_kind: waiting?.kind ?? null,
		waiting_event_name: waiting?.eventName ?? null,
		waiting_node_index: waiting?.nodeIndex ?? null,
		timeout_at: waiting?.kind === "signal" ? (waiting.timeoutAt ?? null) : null,
		timer_due_at:
			waiting?.kind === "timer" || waiting?.kind === "retry"
				? waiting.timerDueAt
				: null,
		error_json: inspection.snapshot.error
			? JSON.stringify(inspection.snapshot.error)
			: null,
		ctx_json: JSON.stringify(inspection.snapshot.ctx),
		history_json: JSON.stringify(inspection.history),
		step_attempts_json: JSON.stringify(inspection.stepAttempts),
		signals_json: JSON.stringify(inspection.signals),
		timers_json: JSON.stringify(inspection.timers),
		created_at: createdAt ?? now,
		updated_at: now,
	};
}

export function deserializeInspection(
	row: SerializedInspectionRow,
): MissionInspection {
	try {
		const waiting = row.waiting_kind
			? (() => {
					const nodeIndex = row.waiting_node_index ?? 0;
					if (row.waiting_kind === "signal") {
						return {
							kind: "signal",
							eventName: row.waiting_event_name ?? "",
							nodeIndex,
							...(row.timeout_at ? { timeoutAt: row.timeout_at } : {}),
						} satisfies NonNullable<MissionInspection["snapshot"]["waiting"]>;
					}
					return {
						kind: row.waiting_kind === "retry" ? "retry" : "timer",
						eventName: row.waiting_event_name ?? "",
						nodeIndex,
						timerDueAt: row.timer_due_at ?? new Date(0).toISOString(),
					} satisfies NonNullable<MissionInspection["snapshot"]["waiting"]>;
				})()
			: undefined;

		return {
			snapshot: {
				missionId: row.mission_id,
				missionName: row.mission_name,
				status: row.status as MissionInspection["snapshot"]["status"],
				cursor: row.cursor,
				error: row.error_json ? JSON.parse(row.error_json) : undefined,
				ctx: JSON.parse(row.ctx_json) as MissionInspection["snapshot"]["ctx"],
				waiting,
			},
			history: JSON.parse(row.history_json) as MissionInspection["history"],
			stepAttempts: JSON.parse(
				row.step_attempts_json,
			) as MissionInspection["stepAttempts"],
			signals: JSON.parse(row.signals_json) as MissionInspection["signals"],
			timers: JSON.parse(row.timers_json) as MissionInspection["timers"],
		};
	} catch (error) {
		throw new Error(
			`Failed to deserialize persisted mission "${row.mission_id}".`,
			{ cause: error },
		);
	}
}
