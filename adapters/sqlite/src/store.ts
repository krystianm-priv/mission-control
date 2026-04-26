import type {
	MissionInspection,
	RecoverableMissionInspection,
	ScheduledMissionSnapshot,
	WaitingMissionSnapshot,
} from "@mission-control/core";
import {
	isRecoverableMissionInspection,
	isScheduledMissionSnapshot,
	isWaitingMissionSnapshot,
} from "@mission-control/core";

import { migration0001Init } from "./migrations/0001_init.ts";
import {
	deserializeInspection,
	type SerializedInspectionRow,
	serializeInspection,
} from "./serialization.ts";
import {
	getSQLiteDatabaseConstructor,
	type SQLiteDatabase,
} from "./sqlite-runtime.ts";

export interface SQLiteStoreOptions {
	databasePath: string;
}

export class SQLiteStore {
	private readonly db: SQLiteDatabase;
	private closed = false;

	private constructor(_options: SQLiteStoreOptions, db: SQLiteDatabase) {
		this.db = db;
		this.bootstrap();
	}

	public static open(options: SQLiteStoreOptions): SQLiteStore {
		const Database = getSQLiteDatabaseConstructor();
		return new SQLiteStore(options, new Database(options.databasePath));
	}

	private bootstrap(): void {
		for (const statement of migration0001Init.statements) {
			this.db.exec(statement);
		}
	}

	public close(): void {
		if (this.closed) {
			return;
		}
		this.closed = true;
		this.db.close();
	}

	public saveInspection(inspection: MissionInspection): void {
		this.ensureOpen();
		const existing = this.db
			.prepare("SELECT created_at FROM mc_missions WHERE mission_id = ?")
			.get(inspection.snapshot.missionId) as { created_at: string } | undefined;
		const row = serializeInspection(inspection, existing?.created_at);
		this.db
			.prepare(
				`INSERT INTO mc_missions (
					mission_id, mission_name, status, cursor, waiting_kind, waiting_event_name,
					waiting_node_index, timeout_at, timer_due_at, error_json, ctx_json,
					history_json, step_attempts_json, signals_json, timers_json, created_at, updated_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				ON CONFLICT(mission_id) DO UPDATE SET
					mission_name = excluded.mission_name,
					status = excluded.status,
					cursor = excluded.cursor,
					waiting_kind = excluded.waiting_kind,
					waiting_event_name = excluded.waiting_event_name,
					waiting_node_index = excluded.waiting_node_index,
					timeout_at = excluded.timeout_at,
					timer_due_at = excluded.timer_due_at,
					error_json = excluded.error_json,
					ctx_json = excluded.ctx_json,
					history_json = excluded.history_json,
					step_attempts_json = excluded.step_attempts_json,
					signals_json = excluded.signals_json,
					timers_json = excluded.timers_json,
					updated_at = excluded.updated_at`,
			)
			.run(
				row.mission_id,
				row.mission_name,
				row.status,
				row.cursor,
				row.waiting_kind,
				row.waiting_event_name,
				row.waiting_node_index,
				row.timeout_at,
				row.timer_due_at,
				row.error_json,
				row.ctx_json,
				row.history_json,
				row.step_attempts_json,
				row.signals_json,
				row.timers_json,
				row.created_at,
				row.updated_at,
			);
	}

	public loadInspection(missionId: string): MissionInspection | undefined {
		this.ensureOpen();
		const row = this.db
			.prepare("SELECT * FROM mc_missions WHERE mission_id = ?")
			.get(missionId) as SerializedInspectionRow | undefined;
		return row ? deserializeInspection(row) : undefined;
	}

	public listWaitingSnapshots(): WaitingMissionSnapshot[] {
		this.ensureOpen();
		return (
			this.db
				.prepare(
					"SELECT * FROM mc_missions WHERE status = 'waiting' ORDER BY updated_at ASC",
				)
				.all() as unknown as SerializedInspectionRow[]
		)
			.map((row) => deserializeInspection(row).snapshot)
			.filter(isWaitingMissionSnapshot);
	}

	public listScheduledSnapshots(): ScheduledMissionSnapshot[] {
		this.ensureOpen();
		return (
			this.db
				.prepare(
					"SELECT * FROM mc_missions WHERE status = 'waiting' AND waiting_kind IN ('timer', 'retry') ORDER BY timer_due_at ASC",
				)
				.all() as unknown as SerializedInspectionRow[]
		)
			.map((row) => deserializeInspection(row).snapshot)
			.filter(isScheduledMissionSnapshot);
	}

	public listRecoverableInspections(): RecoverableMissionInspection[] {
		this.ensureOpen();
		return (
			this.db
				.prepare(
					"SELECT * FROM mc_missions WHERE status IN ('waiting', 'running') ORDER BY updated_at ASC",
				)
				.all() as unknown as SerializedInspectionRow[]
		)
			.map((row) => deserializeInspection(row))
			.filter(isRecoverableMissionInspection);
	}

	public listIncompleteMissionIds(): string[] {
		this.ensureOpen();
		return (
			this.db
				.prepare(
					"SELECT mission_id FROM mc_missions WHERE status IN ('waiting', 'running') ORDER BY updated_at ASC",
				)
				.all() as Array<{ mission_id: string }>
		).map((row) => row.mission_id);
	}

	public listStartAtEntries(): Array<{ missionId: string; startAt: string }> {
		this.ensureOpen();
		return (
			this.db
				.prepare(
					"SELECT mission_id, timer_due_at FROM mc_missions WHERE status = 'waiting' AND waiting_kind IN ('timer', 'retry') AND waiting_event_name LIKE 'start_at%' AND timer_due_at IS NOT NULL ORDER BY timer_due_at ASC",
				)
				.all() as Array<{ mission_id: string; timer_due_at: string }>
		).map((row) => ({ missionId: row.mission_id, startAt: row.timer_due_at }));
	}

	private ensureOpen(): void {
		if (this.closed) {
			throw new Error("SQLiteStore has been closed.");
		}
	}
}
