import assert from "node:assert/strict";
import test from "node:test";

import { getClaimRunnableMissionsSql } from "./leasing.js";
import { POSTGRES_SCHEMA_STATEMENTS } from "./sql.js";

test("postgres schema includes mission, signal, timer, and idempotency tables", () => {
	const ddl = POSTGRES_SCHEMA_STATEMENTS.join("\n");
	assert.match(ddl, /CREATE TABLE IF NOT EXISTS mc_missions/);
	assert.match(ddl, /CREATE TABLE IF NOT EXISTS mc_signals/);
	assert.match(ddl, /CREATE TABLE IF NOT EXISTS mc_timers/);
	assert.match(ddl, /CREATE TABLE IF NOT EXISTS mc_idempotency_keys/);
});

test("claim SQL uses skip locked for multi-worker safety", () => {
	const statement = getClaimRunnableMissionsSql(2);
	assert.match(statement.sql, /FOR UPDATE SKIP LOCKED/);
	assert.deepEqual(statement.params, [2]);
});
