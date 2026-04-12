import type { MissionInspection, MissionSnapshot } from "@mission-control/core";

import { migration0001Init } from "./migrations/0001_init.js";
import {
	deserializeInspection,
	serializeInspection,
	type SerializedInspectionRow,
} from "./serialization.js";
import {
	executeRows,
	executeStatement,
	sqlLiteral,
	type PgCommanderExecute,
} from "./sql-executor.js";

export interface PgStoreOptions {
	execute: PgCommanderExecute;
}

export class PgStore {
	private readonly execute: PgCommanderExecute;

	public constructor(options: PgStoreOptions) {
		this.execute = options.execute;
	}

	public async bootstrap(): Promise<void> {
		for (const statement of migration0001Init.statements) {
			await executeStatement(this.execute, statement);
		}
	}

	public async saveInspection(inspection: MissionInspection): Promise<void> {
		const existingRows = await executeRows(
			this.execute,
			`SELECT created_at FROM mc_missions WHERE mission_id = ${sqlLiteral(inspection.snapshot.missionId)}`,
		);
		const existingCreatedAt =
			typeof existingRows[0]?.created_at === "string" ? existingRows[0].created_at : undefined;
		const row = serializeInspection(inspection, existingCreatedAt);
		await executeStatement(
			this.execute,
			`INSERT INTO mc_missions (
				mission_id, mission_name, status, cursor, waiting_kind, waiting_event_name,
				waiting_node_index, timeout_at, timer_due_at, error_json, ctx_json,
				history_json, step_attempts_json, signals_json, timers_json, created_at, updated_at
			) VALUES (
				${sqlLiteral(row.mission_id)},
				${sqlLiteral(row.mission_name)},
				${sqlLiteral(row.status)},
				${sqlLiteral(row.cursor)},
				${sqlLiteral(row.waiting_kind)},
				${sqlLiteral(row.waiting_event_name)},
				${sqlLiteral(row.waiting_node_index)},
				${sqlLiteral(row.timeout_at)},
				${sqlLiteral(row.timer_due_at)},
				${sqlLiteral(row.error_json)},
				${sqlLiteral(row.ctx_json)},
				${sqlLiteral(row.history_json)},
				${sqlLiteral(row.step_attempts_json)},
				${sqlLiteral(row.signals_json)},
				${sqlLiteral(row.timers_json)},
				${sqlLiteral(row.created_at)},
				${sqlLiteral(row.updated_at)}
			)
			ON CONFLICT (mission_id) DO UPDATE SET
				mission_name = EXCLUDED.mission_name,
				status = EXCLUDED.status,
				cursor = EXCLUDED.cursor,
				waiting_kind = EXCLUDED.waiting_kind,
				waiting_event_name = EXCLUDED.waiting_event_name,
				waiting_node_index = EXCLUDED.waiting_node_index,
				timeout_at = EXCLUDED.timeout_at,
				timer_due_at = EXCLUDED.timer_due_at,
				error_json = EXCLUDED.error_json,
				ctx_json = EXCLUDED.ctx_json,
				history_json = EXCLUDED.history_json,
				step_attempts_json = EXCLUDED.step_attempts_json,
				signals_json = EXCLUDED.signals_json,
				timers_json = EXCLUDED.timers_json,
				updated_at = EXCLUDED.updated_at`,
		);
	}

	public async loadInspection(missionId: string): Promise<MissionInspection | undefined> {
		const rows = await executeRows(
			this.execute,
			`SELECT * FROM mc_missions WHERE mission_id = ${sqlLiteral(missionId)}`,
		);
		const row = rows[0] as SerializedInspectionRow | undefined;
		return row ? deserializeInspection(row) : undefined;
	}

	public async listWaitingSnapshots(): Promise<MissionSnapshot[]> {
		const rows = await executeRows(
			this.execute,
			"SELECT * FROM mc_missions WHERE status = 'waiting' ORDER BY updated_at ASC",
		);
		return rows.map((row) => deserializeInspection(row as unknown as SerializedInspectionRow).snapshot);
	}

	public async listScheduledSnapshots(): Promise<MissionSnapshot[]> {
		const rows = await executeRows(
			this.execute,
			"SELECT * FROM mc_missions WHERE status = 'waiting' AND waiting_kind IN ('timer', 'retry') ORDER BY timer_due_at ASC",
		);
		return rows.map((row) => deserializeInspection(row as unknown as SerializedInspectionRow).snapshot);
	}

	public async listRecoverableInspections(): Promise<MissionInspection[]> {
		const rows = await executeRows(
			this.execute,
			"SELECT * FROM mc_missions WHERE status IN ('waiting', 'running') ORDER BY updated_at ASC",
		);
		return rows.map((row) => deserializeInspection(row as unknown as SerializedInspectionRow));
	}
}
