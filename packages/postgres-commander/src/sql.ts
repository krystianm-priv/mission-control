export const POSTGRES_SCHEMA_STATEMENTS = [
	`CREATE TABLE IF NOT EXISTS mc_missions (
		mission_id TEXT PRIMARY KEY,
		mission_name TEXT NOT NULL,
		status TEXT NOT NULL,
		cursor INTEGER NOT NULL,
		waiting_kind TEXT,
		waiting_event_name TEXT,
		waiting_node_index INTEGER,
		timeout_at TIMESTAMPTZ,
		timer_due_at TIMESTAMPTZ,
		error_json JSONB,
		ctx_json JSONB NOT NULL,
		created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
	);`,
	`CREATE TABLE IF NOT EXISTS mc_mission_history (
		history_id BIGSERIAL PRIMARY KEY,
		mission_id TEXT NOT NULL REFERENCES mc_missions(mission_id) ON DELETE CASCADE,
		event_type TEXT NOT NULL,
		event_name TEXT,
		attempt_number INTEGER,
		at TIMESTAMPTZ NOT NULL,
		details_json JSONB,
		sensitive BOOLEAN NOT NULL DEFAULT FALSE
	);`,
	`CREATE TABLE IF NOT EXISTS mc_signals (
		signal_id BIGSERIAL PRIMARY KEY,
		mission_id TEXT NOT NULL REFERENCES mc_missions(mission_id) ON DELETE CASCADE,
		event_name TEXT NOT NULL,
		idempotency_key TEXT,
		payload_json JSONB NOT NULL,
		received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		UNIQUE (mission_id, event_name, idempotency_key)
	);`,
	`CREATE TABLE IF NOT EXISTS mc_step_attempts (
		attempt_id BIGSERIAL PRIMARY KEY,
		mission_id TEXT NOT NULL REFERENCES mc_missions(mission_id) ON DELETE CASCADE,
		step_name TEXT NOT NULL,
		attempt_number INTEGER NOT NULL,
		status TEXT NOT NULL,
		started_at TIMESTAMPTZ NOT NULL,
		finished_at TIMESTAMPTZ,
		error_text TEXT,
		UNIQUE (mission_id, step_name, attempt_number)
	);`,
	`CREATE TABLE IF NOT EXISTS mc_timers (
		timer_id BIGSERIAL PRIMARY KEY,
		mission_id TEXT NOT NULL REFERENCES mc_missions(mission_id) ON DELETE CASCADE,
		event_name TEXT NOT NULL,
		scheduled_at TIMESTAMPTZ NOT NULL,
		due_at TIMESTAMPTZ NOT NULL,
		resumed_at TIMESTAMPTZ,
		status TEXT NOT NULL
	);`,
	`CREATE TABLE IF NOT EXISTS mc_idempotency_keys (
		id BIGSERIAL PRIMARY KEY,
		scope TEXT NOT NULL,
		key TEXT NOT NULL,
		mission_id TEXT NOT NULL REFERENCES mc_missions(mission_id) ON DELETE CASCADE,
		response_json JSONB NOT NULL,
		created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		UNIQUE (scope, key)
	);`,
	`CREATE INDEX IF NOT EXISTS mc_missions_status_idx
		ON mc_missions (status, updated_at);`,
	`CREATE INDEX IF NOT EXISTS mc_missions_waiting_idx
		ON mc_missions (waiting_kind, waiting_event_name, timeout_at, timer_due_at);`,
	`CREATE INDEX IF NOT EXISTS mc_history_mission_at_idx
		ON mc_mission_history (mission_id, at DESC);`,
	`CREATE INDEX IF NOT EXISTS mc_signals_mission_idx
		ON mc_signals (mission_id, received_at DESC);`,
	`CREATE INDEX IF NOT EXISTS mc_timers_due_idx
		ON mc_timers (status, due_at);`,
];

export const CLAIM_RUNNABLE_MISSIONS_SQL = `WITH candidate AS (
	SELECT mission_id
	FROM mc_missions
	WHERE (
		status = 'running'
		OR (status = 'waiting' AND waiting_kind = 'timer' AND timer_due_at <= NOW())
	)
	ORDER BY updated_at ASC
	FOR UPDATE SKIP LOCKED
	LIMIT $1
)
SELECT mission_id FROM candidate;`;
