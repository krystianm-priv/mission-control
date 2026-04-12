import assert from "node:assert/strict";
import test from "node:test";

import { POSTGRES_SCHEMA_STATEMENTS } from "./schema.js";

test("postgres schema includes mission table and indexes", () => {
	const ddl = POSTGRES_SCHEMA_STATEMENTS.join("\n");
	assert.match(ddl, /CREATE TABLE IF NOT EXISTS mc_missions/);
	assert.match(ddl, /CREATE INDEX IF NOT EXISTS mc_missions_status_idx/);
	assert.match(ddl, /CREATE INDEX IF NOT EXISTS mc_missions_waiting_idx/);
});
