export const POSTGRES_SCHEMA_STATEMENTS = [
	`CREATE TABLE IF NOT EXISTS mc_missions (
		mission_id TEXT PRIMARY KEY,
		mission_name TEXT NOT NULL,
		status TEXT NOT NULL,
		cursor INTEGER NOT NULL,
		waiting_kind TEXT,
		waiting_event_name TEXT,
		waiting_node_index INTEGER,
		timeout_at TEXT,
		timer_due_at TEXT,
		error_json TEXT,
		ctx_json TEXT NOT NULL,
		history_json TEXT NOT NULL,
		step_attempts_json TEXT NOT NULL,
		signals_json TEXT NOT NULL,
		timers_json TEXT NOT NULL,
		created_at TEXT NOT NULL,
		updated_at TEXT NOT NULL
	);`,
	`CREATE INDEX IF NOT EXISTS mc_missions_status_idx
		ON mc_missions (status, updated_at);`,
	`CREATE INDEX IF NOT EXISTS mc_missions_waiting_idx
		ON mc_missions (waiting_kind, waiting_event_name, timer_due_at, timeout_at);`,
	`CREATE TABLE IF NOT EXISTS mc_runtime_tasks (
		task_id TEXT PRIMARY KEY,
		mission_id TEXT NOT NULL,
		mission_name TEXT NOT NULL,
		task_kind TEXT NOT NULL,
		status TEXT NOT NULL,
		run_at TEXT NOT NULL,
		claim_owner TEXT,
		claim_expires_at TEXT,
		attempts INTEGER NOT NULL DEFAULT 0,
		last_error_json TEXT,
		created_at TEXT NOT NULL,
		updated_at TEXT NOT NULL
	);`,
	`CREATE INDEX IF NOT EXISTS mc_runtime_tasks_claim_idx
		ON mc_runtime_tasks (status, run_at, claim_expires_at);`,
	`CREATE INDEX IF NOT EXISTS mc_runtime_tasks_mission_idx
		ON mc_runtime_tasks (mission_id, status);`,
	`CREATE TABLE IF NOT EXISTS mc_runtime_history (
		history_id TEXT PRIMARY KEY,
		mission_id TEXT NOT NULL,
		task_id TEXT,
		event_type TEXT NOT NULL,
		event_json TEXT NOT NULL,
		created_at TEXT NOT NULL
	);`,
	`CREATE INDEX IF NOT EXISTS mc_runtime_history_mission_idx
		ON mc_runtime_history (mission_id, created_at);`,
	`CREATE TABLE IF NOT EXISTS mc_runtime_cancellations (
		mission_id TEXT PRIMARY KEY,
		reason TEXT NOT NULL,
		requested_at TEXT NOT NULL
	);`,
];
