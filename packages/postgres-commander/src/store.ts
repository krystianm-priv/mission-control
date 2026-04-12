import type {
	MissionHistoryRecord,
	MissionInspection,
	MissionSnapshot,
} from "@mission-control/commander";

import { serializeMissionState } from "./serialization.js";

export interface PostgresQueryResult<Row> {
	rows: Row[];
}

export interface PostgresQueryClient {
	query<Row = Record<string, unknown>>(
		sql: string,
		params?: readonly unknown[],
	): Promise<PostgresQueryResult<Row>>;
}

export interface MissionRow {
	mission_id: string;
	mission_name: string;
	status: string;
	cursor: number;
	waiting_kind: string | null;
	waiting_event_name: string | null;
	waiting_node_index: number | null;
	timeout_at: string | null;
	timer_due_at: string | null;
	error_json: MissionSnapshot["error"] | null;
	ctx_json: MissionSnapshot["ctx"];
}

export class PostgresStore {
	public constructor(private readonly client: PostgresQueryClient) {}

	public async createMission(snapshot: MissionSnapshot): Promise<void> {
		await this.client.query(
			`INSERT INTO mc_missions (
				mission_id, mission_name, status, cursor, waiting_kind, waiting_event_name,
				waiting_node_index, timeout_at, timer_due_at, error_json, ctx_json
			) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
			[
				snapshot.missionId,
				snapshot.missionName,
				snapshot.status,
				snapshot.cursor,
				snapshot.waiting?.kind ?? null,
				snapshot.waiting?.eventName ?? null,
				snapshot.waiting?.nodeIndex ?? null,
				snapshot.waiting?.timeoutAt ?? null,
				snapshot.waiting?.timerDueAt ?? null,
				snapshot.error ?? null,
				snapshot.ctx,
			],
		);
	}

	public async appendHistory(
		missionId: string,
		record: MissionHistoryRecord,
	): Promise<void> {
		await this.client.query(
			`INSERT INTO mc_mission_history (
				mission_id, event_type, event_name, attempt_number, at, details_json
			) VALUES ($1,$2,$3,$4,$5,$6)`,
			[
				missionId,
				record.type,
				record.eventName ?? null,
				record.attemptNumber ?? null,
				record.at,
				record.details ?? null,
			],
		);
	}

	public async enqueueSignal(args: {
		missionId: string;
		eventName: string;
		payload: unknown;
		idempotencyKey?: string;
	}): Promise<void> {
		await this.client.query(
			`INSERT INTO mc_signals (mission_id, event_name, idempotency_key, payload_json)
			 VALUES ($1,$2,$3,$4)`,
			[
				args.missionId,
				args.eventName,
				args.idempotencyKey ?? null,
				args.payload,
			],
		);
	}

	public async updateSnapshot(snapshot: MissionSnapshot): Promise<void> {
		await this.client.query(
			`UPDATE mc_missions
			 SET status = $2,
				cursor = $3,
				waiting_kind = $4,
				waiting_event_name = $5,
				waiting_node_index = $6,
				timeout_at = $7,
				timer_due_at = $8,
				error_json = $9,
				ctx_json = $10,
				updated_at = NOW()
			 WHERE mission_id = $1`,
			[
				snapshot.missionId,
				snapshot.status,
				snapshot.cursor,
				snapshot.waiting?.kind ?? null,
				snapshot.waiting?.eventName ?? null,
				snapshot.waiting?.nodeIndex ?? null,
				snapshot.waiting?.timeoutAt ?? null,
				snapshot.waiting?.timerDueAt ?? null,
				snapshot.error ?? null,
				snapshot.ctx,
			],
		);
	}

	public async readMissionSnapshot(
		missionId: string,
	): Promise<MissionRow | undefined> {
		const result = await this.client.query<MissionRow>(
			`SELECT mission_id, mission_name, status, cursor, waiting_kind,
				waiting_event_name, waiting_node_index, timeout_at, timer_due_at,
				error_json, ctx_json
			 FROM mc_missions
			 WHERE mission_id = $1`,
			[missionId],
		);
		return result.rows[0];
	}

	public async listWaitingMissionRows(): Promise<MissionRow[]> {
		const result = await this.client.query<MissionRow>(
			`SELECT mission_id, mission_name, status, cursor, waiting_kind,
				waiting_event_name, waiting_node_index, timeout_at, timer_due_at,
				error_json, ctx_json
			 FROM mc_missions
			 WHERE status = 'waiting'
			 ORDER BY updated_at ASC`,
		);
		return result.rows;
	}

	public async listScheduledMissionRows(): Promise<MissionRow[]> {
		const result = await this.client.query<MissionRow>(
			`SELECT mission_id, mission_name, status, cursor, waiting_kind,
				waiting_event_name, waiting_node_index, timeout_at, timer_due_at,
				error_json, ctx_json
			 FROM mc_missions
			 WHERE status = 'waiting' AND waiting_kind = 'timer'
			 ORDER BY timer_due_at ASC`,
		);
		return result.rows;
	}

	public async persistInspection(inspection: MissionInspection): Promise<void> {
		const serialized = serializeMissionState({
			snapshot: inspection.snapshot,
			history: inspection.history,
			stepAttempts: inspection.stepAttempts,
			signals: inspection.signals,
			timers: inspection.timers,
		});
		await this.client.query(
			`INSERT INTO mc_idempotency_keys (scope, key, mission_id, response_json)
			 VALUES ($1,$2,$3,$4)`,
			[
				"inspection",
				inspection.snapshot.missionId,
				inspection.snapshot.missionId,
				serialized,
			],
		);
	}
}
