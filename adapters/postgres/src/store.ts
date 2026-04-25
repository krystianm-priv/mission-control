import type {
	CommanderPersistenceAdapter,
	MissionInspection,
	MissionSnapshot,
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
	executeRows,
	executeStatement,
	type PgCommanderExecute,
	sqlLiteral,
} from "./sql-executor.ts";

export interface PgStoreOptions {
	execute: PgCommanderExecute;
}

export type PgRuntimeTaskKind =
	| "start"
	| "signal"
	| "timer"
	| "retry"
	| "update"
	| "cancel"
	| "recover";

export interface PgRuntimeTask {
	taskId: string;
	missionId: string;
	missionName: string;
	taskKind: PgRuntimeTaskKind;
	status: "pending" | "claimed" | "completed" | "failed" | "cancelled";
	runAt: string;
	claimOwner: string | undefined;
	claimExpiresAt: string | undefined;
	attempts: number;
	lastError: unknown;
	createdAt: string;
	updatedAt: string;
}

export interface ClaimRuntimeTasksOptions {
	owner: string;
	now: Date;
	leaseMs: number;
	limit: number;
}

export class PgStore implements CommanderPersistenceAdapter {
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
			typeof existingRows[0]?.["created_at"] === "string"
				? existingRows[0]["created_at"]
				: undefined;
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
		await this.persistRuntimeProjection(inspection, row.updated_at);
	}

	public async loadInspection(
		missionId: string,
	): Promise<MissionInspection | undefined> {
		const rows = await executeRows(
			this.execute,
			`SELECT * FROM mc_missions WHERE mission_id = ${sqlLiteral(missionId)}`,
		);
		const row = rows[0] as unknown as SerializedInspectionRow | undefined;
		return row ? deserializeInspection(row) : undefined;
	}

	public async listWaitingSnapshots(): Promise<WaitingMissionSnapshot[]> {
		const rows = await executeRows(
			this.execute,
			"SELECT * FROM mc_missions WHERE status = 'waiting' ORDER BY updated_at ASC",
		);
		return rows
			.map(
				(row) =>
					deserializeInspection(row as unknown as SerializedInspectionRow)
						.snapshot,
			)
			.filter(isWaitingMissionSnapshot);
	}

	public async listScheduledSnapshots(): Promise<ScheduledMissionSnapshot[]> {
		const rows = await executeRows(
			this.execute,
			"SELECT * FROM mc_missions WHERE status = 'waiting' AND waiting_kind IN ('timer', 'retry') ORDER BY timer_due_at ASC",
		);
		return rows
			.map(
				(row) =>
					deserializeInspection(row as unknown as SerializedInspectionRow)
						.snapshot,
			)
			.filter(isScheduledMissionSnapshot);
	}

	public async listRecoverableInspections(): Promise<
		RecoverableMissionInspection[]
	> {
		const rows = await executeRows(
			this.execute,
			"SELECT * FROM mc_missions WHERE status IN ('waiting', 'running') ORDER BY updated_at ASC",
		);
		return rows
			.map((row) =>
				deserializeInspection(row as unknown as SerializedInspectionRow),
			)
			.filter(isRecoverableMissionInspection);
	}

	public async requestCancellation(
		missionId: string,
		reason = "Mission cancelled.",
		now = new Date(),
	): Promise<void> {
		const requestedAt = now.toISOString();
		await executeStatement(
			this.execute,
			`INSERT INTO mc_runtime_cancellations (
				mission_id, reason, requested_at
			) VALUES (
				${sqlLiteral(missionId)},
				${sqlLiteral(reason)},
				${sqlLiteral(requestedAt)}
			)
			ON CONFLICT (mission_id) DO UPDATE SET
				reason = EXCLUDED.reason,
				requested_at = EXCLUDED.requested_at`,
		);
		await executeStatement(
			this.execute,
			`UPDATE mc_runtime_tasks
				SET status = 'cancelled',
					updated_at = ${sqlLiteral(requestedAt)}
				WHERE mission_id = ${sqlLiteral(missionId)}
					AND status IN ('pending', 'claimed')`,
		);
		await executeStatement(
			this.execute,
			`UPDATE mc_missions
				SET status = 'cancelled',
					waiting_kind = NULL,
					waiting_event_name = NULL,
					waiting_node_index = NULL,
					timeout_at = NULL,
					timer_due_at = NULL,
					error_json = ${sqlLiteral(
						JSON.stringify({
							message: reason,
							at: requestedAt,
							code: "MISSION_CANCELLED",
						}),
					)},
					updated_at = ${sqlLiteral(requestedAt)}
				WHERE mission_id = ${sqlLiteral(missionId)}
					AND status NOT IN ('completed', 'failed', 'cancelled')`,
		);
		await executeStatement(
			this.execute,
			`INSERT INTO mc_runtime_history (
				history_id, mission_id, task_id, event_type, event_json, created_at
			) VALUES (
				${sqlLiteral(`${missionId}:cancel:${requestedAt}`)},
				${sqlLiteral(missionId)},
				NULL,
				'mission-cancelled',
				${sqlLiteral(
					JSON.stringify({
						type: "mission-cancelled",
						at: requestedAt,
						details: { reason },
					}),
				)},
				${sqlLiteral(requestedAt)}
			)
			ON CONFLICT (history_id) DO NOTHING`,
		);
	}

	public async isCancellationRequested(missionId: string): Promise<boolean> {
		const rows = await executeRows(
			this.execute,
			`SELECT mission_id FROM mc_runtime_cancellations WHERE mission_id = ${sqlLiteral(missionId)}`,
		);
		return rows.length > 0;
	}

	public async claimRuntimeTasks(
		options: ClaimRuntimeTasksOptions,
	): Promise<PgRuntimeTask[]> {
		const now = options.now.toISOString();
		const leaseExpiresAt = new Date(
			options.now.getTime() + options.leaseMs,
		).toISOString();
		const rows = await executeRows(
			this.execute,
			`UPDATE mc_runtime_tasks
				SET status = 'claimed',
					claim_owner = ${sqlLiteral(options.owner)},
					claim_expires_at = ${sqlLiteral(leaseExpiresAt)},
					attempts = attempts + 1,
					updated_at = ${sqlLiteral(now)}
				WHERE task_id IN (
					SELECT task_id FROM mc_runtime_tasks
					WHERE status IN ('pending', 'claimed')
						AND run_at <= ${sqlLiteral(now)}
						AND (
							status = 'pending'
							OR claim_expires_at IS NULL
							OR claim_expires_at <= ${sqlLiteral(now)}
						)
					ORDER BY run_at ASC, created_at ASC
					LIMIT ${Math.max(1, Math.trunc(options.limit))}
				)
				RETURNING *`,
		);
		return rows.map((row) => this.deserializeTask(row));
	}

	public async completeRuntimeTask(
		taskId: string,
		owner: string,
		now = new Date(),
	): Promise<void> {
		await executeStatement(
			this.execute,
			`UPDATE mc_runtime_tasks
				SET status = 'completed',
					claim_owner = NULL,
					claim_expires_at = NULL,
					updated_at = ${sqlLiteral(now.toISOString())}
				WHERE task_id = ${sqlLiteral(taskId)}
					AND claim_owner = ${sqlLiteral(owner)}`,
		);
	}

	public async failRuntimeTask(
		taskId: string,
		owner: string,
		error: unknown,
		now = new Date(),
	): Promise<void> {
		await executeStatement(
			this.execute,
			`UPDATE mc_runtime_tasks
				SET status = 'failed',
					last_error_json = ${sqlLiteral(JSON.stringify(error))},
					claim_owner = NULL,
					claim_expires_at = NULL,
					updated_at = ${sqlLiteral(now.toISOString())}
				WHERE task_id = ${sqlLiteral(taskId)}
					AND claim_owner = ${sqlLiteral(owner)}`,
		);
	}

	public async releaseRuntimeClaims(
		owner: string,
		now = new Date(),
	): Promise<void> {
		await executeStatement(
			this.execute,
			`UPDATE mc_runtime_tasks
				SET status = 'pending',
					claim_owner = NULL,
					claim_expires_at = NULL,
					updated_at = ${sqlLiteral(now.toISOString())}
				WHERE status = 'claimed'
					AND claim_owner = ${sqlLiteral(owner)}`,
		);
	}

	private async persistRuntimeProjection(
		inspection: MissionInspection,
		updatedAt: string,
	): Promise<void> {
		await this.appendRuntimeHistory(inspection, updatedAt);
		await this.upsertRuntimeTask(inspection.snapshot, updatedAt);
	}

	private async appendRuntimeHistory(
		inspection: MissionInspection,
		createdAt: string,
	): Promise<void> {
		for (let index = 0; index < inspection.history.length; index += 1) {
			const record = inspection.history[index];
			if (!record) {
				continue;
			}
			const historyId = `${inspection.snapshot.missionId}:${index}:${record.type}`;
			await executeStatement(
				this.execute,
				`INSERT INTO mc_runtime_history (
					history_id, mission_id, task_id, event_type, event_json, created_at
				) VALUES (
					${sqlLiteral(historyId)},
					${sqlLiteral(inspection.snapshot.missionId)},
					NULL,
					${sqlLiteral(record.type)},
					${sqlLiteral(JSON.stringify(record))},
					${sqlLiteral(record.at)}
				)
				ON CONFLICT (history_id) DO NOTHING`,
			);
		}
		if (inspection.history.length === 0) {
			await executeStatement(
				this.execute,
				`INSERT INTO mc_runtime_history (
					history_id, mission_id, task_id, event_type, event_json, created_at
				) VALUES (
					${sqlLiteral(`${inspection.snapshot.missionId}:snapshot:${createdAt}`)},
					${sqlLiteral(inspection.snapshot.missionId)},
					NULL,
					'snapshot-saved',
					${sqlLiteral(JSON.stringify({ at: createdAt }))},
					${sqlLiteral(createdAt)}
				)
				ON CONFLICT (history_id) DO NOTHING`,
			);
		}
	}

	private async upsertRuntimeTask(
		snapshot: MissionSnapshot,
		updatedAt: string,
	): Promise<void> {
		const task = this.taskFromSnapshot(snapshot, updatedAt);
		if (!task) {
			const terminalTaskStatus =
				snapshot.status === "cancelled"
					? "cancelled"
					: snapshot.status === "failed"
						? "failed"
						: "completed";
			await executeStatement(
				this.execute,
				`UPDATE mc_runtime_tasks
					SET status = ${sqlLiteral(terminalTaskStatus)},
						updated_at = ${sqlLiteral(updatedAt)},
						claim_owner = NULL,
						claim_expires_at = NULL
					WHERE mission_id = ${sqlLiteral(snapshot.missionId)}
						AND status IN ('pending', 'claimed')`,
			);
			return;
		}

		await executeStatement(
			this.execute,
			`INSERT INTO mc_runtime_tasks (
				task_id, mission_id, mission_name, task_kind, status, run_at,
				claim_owner, claim_expires_at, attempts, last_error_json, created_at, updated_at
			) VALUES (
				${sqlLiteral(task.taskId)},
				${sqlLiteral(task.missionId)},
				${sqlLiteral(task.missionName)},
				${sqlLiteral(task.taskKind)},
				'pending',
				${sqlLiteral(task.runAt)},
				NULL,
				NULL,
				0,
				NULL,
				${sqlLiteral(updatedAt)},
				${sqlLiteral(updatedAt)}
			)
			ON CONFLICT (task_id) DO UPDATE SET
				mission_name = EXCLUDED.mission_name,
				task_kind = EXCLUDED.task_kind,
				run_at = EXCLUDED.run_at,
				status = CASE
					WHEN mc_runtime_tasks.status = 'completed' THEN mc_runtime_tasks.status
					ELSE EXCLUDED.status
				END,
				updated_at = EXCLUDED.updated_at`,
		);
	}

	private taskFromSnapshot(
		snapshot: MissionSnapshot,
		updatedAt: string,
	):
		| {
				taskId: string;
				missionId: string;
				missionName: string;
				taskKind: PgRuntimeTaskKind;
				runAt: string;
		  }
		| undefined {
		if (snapshot.status === "running") {
			return {
				taskId: `${snapshot.missionId}:recover:${snapshot.cursor}`,
				missionId: snapshot.missionId,
				missionName: snapshot.missionName,
				taskKind: "recover",
				runAt: updatedAt,
			};
		}
		if (snapshot.status !== "waiting" || !snapshot.waiting) {
			return undefined;
		}
		if (snapshot.waiting.kind === "signal") {
			return {
				taskId: `${snapshot.missionId}:signal:${snapshot.waiting.eventName}:${snapshot.waiting.nodeIndex}`,
				missionId: snapshot.missionId,
				missionName: snapshot.missionName,
				taskKind: "signal",
				runAt: snapshot.waiting.timeoutAt ?? updatedAt,
			};
		}
		return {
			taskId: `${snapshot.missionId}:${snapshot.waiting.kind}:${snapshot.waiting.eventName}:${snapshot.waiting.nodeIndex}`,
			missionId: snapshot.missionId,
			missionName: snapshot.missionName,
			taskKind: snapshot.waiting.kind,
			runAt: snapshot.waiting.timerDueAt,
		};
	}

	private deserializeTask(row: Record<string, unknown>): PgRuntimeTask {
		return {
			taskId: String(row["task_id"]),
			missionId: String(row["mission_id"]),
			missionName: String(row["mission_name"]),
			taskKind: String(row["task_kind"]) as PgRuntimeTaskKind,
			status: String(row["status"]) as PgRuntimeTask["status"],
			runAt: String(row["run_at"]),
			claimOwner:
				typeof row["claim_owner"] === "string"
					? row["claim_owner"]
					: undefined,
			claimExpiresAt:
				typeof row["claim_expires_at"] === "string"
					? row["claim_expires_at"]
					: undefined,
			attempts:
				typeof row["attempts"] === "number"
					? row["attempts"]
					: Number(row["attempts"] ?? 0),
			lastError:
				typeof row["last_error_json"] === "string"
					? JSON.parse(row["last_error_json"])
					: undefined,
			createdAt: String(row["created_at"]),
			updatedAt: String(row["updated_at"]),
		};
	}
}
