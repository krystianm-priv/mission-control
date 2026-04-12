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
];
