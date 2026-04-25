import assert from "node:assert/strict";
import test from "node:test";

import { runMissionControlCli } from "./index.ts";

test("CLI lists, inspects, and cancels through the Postgres adapter boundary", async () => {
	const calls: string[] = [];
	const rows = new Map<string, Record<string, unknown>>();
	const execute = (query: string): unknown => {
		calls.push(query);
		if (query.includes("SELECT * FROM mc_missions WHERE status = 'waiting'")) {
			return { rows: [...rows.values()] };
		}
		if (query.includes("SELECT * FROM mc_missions WHERE mission_id = 'mission-1'")) {
			return { rows: [...rows.values()] };
		}
		return { rows: [] };
	};
	rows.set("mission-1", {
		mission_id: "mission-1",
		mission_name: "demo",
		status: "waiting",
		cursor: 1,
		waiting_kind: "signal",
		waiting_event_name: "approve",
		waiting_node_index: 1,
		timeout_at: null,
		timer_due_at: null,
		error_json: null,
		ctx_json: JSON.stringify({ missionId: "mission-1", events: {} }),
		history_json: JSON.stringify([]),
		step_attempts_json: JSON.stringify([]),
		signals_json: JSON.stringify([]),
		timers_json: JSON.stringify([]),
		created_at: new Date(0).toISOString(),
		updated_at: new Date(0).toISOString(),
	});

	const listed = await runMissionControlCli({
		args: ["list", "--waiting"],
		execute,
	});
	const inspected = await runMissionControlCli({
		args: ["inspect", "mission-1"],
		execute,
	});
	const cancelled = await runMissionControlCli({
		args: ["cancel", "mission-1", "operator", "cancel"],
		execute,
		now: new Date(0),
	});

	assert.match(listed, /mission-1/);
	assert.match(inspected, /approve/);
	assert.match(cancelled, /operator cancel/);
	assert.equal(
		calls.some((query) => query.includes("mc_runtime_cancellations")),
		true,
	);
});
