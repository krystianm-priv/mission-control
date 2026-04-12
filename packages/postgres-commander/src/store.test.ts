import assert from "node:assert/strict";
import test from "node:test";

import type { MissionSnapshot } from "@mission-control/commander";

import { PostgresStore, type PostgresQueryClient } from "./store.js";

class FakeClient implements PostgresQueryClient {
	public readonly calls: Array<{
		sql: string;
		params: readonly unknown[] | undefined;
	}> = [];

	public async query<Row>(
		sql: string,
		params?: readonly unknown[],
	): Promise<{ rows: Row[] }> {
		this.calls.push({ sql, params });
		return { rows: [] };
	}
}

function createSnapshot(): MissionSnapshot {
	return {
		missionId: "mission-1",
		missionName: "demo",
		status: "waiting",
		cursor: 2,
		error: undefined,
		ctx: {
			missionId: "mission-1",
			events: {
				start: { input: { id: "123" } },
			},
		},
		waiting: {
			kind: "signal",
			eventName: "approval",
			nodeIndex: 2,
		},
	};
}

test("PostgresStore writes mission creation and updates with explicit serialized state fields", async () => {
	const client = new FakeClient();
	const store = new PostgresStore(client);
	const snapshot = createSnapshot();

	await store.createMission(snapshot);
	await store.updateSnapshot(snapshot);

	assert.match(client.calls[0]?.sql ?? "", /INSERT INTO mc_missions/);
	assert.equal(client.calls[0]?.params?.[0], "mission-1");
	assert.match(client.calls[1]?.sql ?? "", /UPDATE mc_missions/);
	assert.equal(client.calls[1]?.params?.[1], "waiting");
});

test("PostgresStore supports history, signals, and inspection-oriented reads", async () => {
	const client = new FakeClient();
	const store = new PostgresStore(client);

	await store.appendHistory("mission-1", {
		type: "signal-received",
		at: new Date(0).toISOString(),
		eventName: "approval",
	});
	await store.enqueueSignal({
		missionId: "mission-1",
		eventName: "approval",
		payload: { approved: true },
		idempotencyKey: "sig-1",
	});
	await store.readMissionSnapshot("mission-1");
	await store.listWaitingMissionRows();
	await store.listScheduledMissionRows();

	assert.match(client.calls[0]?.sql ?? "", /INSERT INTO mc_mission_history/);
	assert.match(client.calls[1]?.sql ?? "", /INSERT INTO mc_signals/);
	assert.match(client.calls[2]?.sql ?? "", /WHERE mission_id = \$1/);
	assert.match(client.calls[3]?.sql ?? "", /WHERE status = 'waiting'/);
	assert.match(
		client.calls[4]?.sql ?? "",
		/WHERE status = 'waiting' AND waiting_kind = 'timer'/,
	);
});
