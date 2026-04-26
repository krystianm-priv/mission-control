import assert from "node:assert/strict";
import test from "node:test";

import {
	createCommander,
	MissionDefinitionError,
	MissionSignalError,
	MissionValidationError,
	m,
} from "@mission-control/core";
import { InMemoryCommander } from "@mission-control/in-memory-commander";

const TEST_TIMEOUT_MS = 8_000;

function parseStrictStart(input: unknown): { id: string } {
	const value = input as { id?: unknown; [key: string]: unknown };
	if (
		typeof input !== "object" ||
		input === null ||
		typeof value.id !== "string" ||
		Object.keys(value).length !== 1
	) {
		throw new Error("Invalid start payload.");
	}
	return { id: value.id };
}

function parseStrictApproval(input: unknown): { approvedBy: string } {
	const value = input as { approvedBy?: unknown; [key: string]: unknown };
	if (
		typeof input !== "object" ||
		input === null ||
		typeof value.approvedBy !== "string" ||
		Object.keys(value).length !== 1
	) {
		throw new Error("Invalid approval payload.");
	}
	return { approvedBy: value.approvedBy };
}

function createApprovalMission(name: string) {
	return m
		.define(name)
		.start({
			input: { parse: parseStrictStart },
			run: async ({ ctx }) => ({ id: ctx.events.start.input.id }),
		})
		.needTo("approve", { parse: parseStrictApproval })
		.step("finish", async ({ ctx }) => ({
			id: ctx.events.start.output.id,
			approvedBy: ctx.events.approve.input.approvedBy,
		}))
		.end();
}

test(
	"public API: unknown mission names fail when starting by string",
	{ timeout: TEST_TIMEOUT_MS },
	async () => {
		const mission = createApprovalMission("known-mission");
		const commander = new InMemoryCommander({ definitions: [mission] });

		await assert.rejects(
			() => commander.start("unknown-mission", { id: "x" } as never),
			/error|registered/i,
		);
	},
);

test(
	"public API: duplicate update names in definition fail fast",
	{ timeout: TEST_TIMEOUT_MS },
	() => {
		assert.throws(
			() =>
				m
					.define("bad-definition")
					.update(
						"duplicate-update",
						{ parse: (input) => input as { value: string } },
						({ input }) => input.value,
					)
					.update(
						"duplicate-update",
						{ parse: (input) => input as { value: string } },
						({ input }) => input.value,
					)
					.start({
						input: { parse: parseStrictStart },
						run: async () => ({ ok: true }),
					})
					.end(),
			MissionDefinitionError,
		);
	},
);

test(
	"public API: handle from getMission can signal and complete mission",
	{ timeout: TEST_TIMEOUT_MS },
	async () => {
		const mission = createApprovalMission("retrieve-and-signal");
		const commander = new InMemoryCommander({ definitions: [mission] });

		const created = commander.createMission(mission, {
			missionId: "m-retrieve-1",
		});
		await created.start({ id: "abc" });

		const retrieved =
			await commander.getMission<typeof mission>("m-retrieve-1");
		assert.ok(retrieved);
		if (!retrieved) {
			assert.fail("expected mission handle to be retrievable");
		}

		await retrieved.signal("approve", { approvedBy: "ops" });
		const completed = await retrieved.waitForCompletion();
		assert.equal(completed.status, "completed");
		assert.deepEqual(
			retrieved.inspect().snapshot.ctx.events["finish"]?.output,
			{
				id: "abc",
				approvedBy: "ops",
			},
		);
	},
);

test(
	"public API: signaling before start fails with mission signal error",
	{ timeout: TEST_TIMEOUT_MS },
	async () => {
		const mission = createApprovalMission("signal-before-start");
		const commander = createCommander({ definitions: [mission] });
		await commander.waitUntilReady();
		const handle = commander.createMission(mission);

		await assert.rejects(
			() => handle.signal("approve", { approvedBy: "ops" }),
			MissionSignalError,
		);
	},
);

test(
	"public API: signals after completion are rejected",
	{ timeout: TEST_TIMEOUT_MS },
	async () => {
		const mission = createApprovalMission("signal-after-complete");
		const commander = createCommander({ definitions: [mission] });
		await commander.waitUntilReady();
		const handle = await commander.start(mission, { id: "xyz" });
		await handle.signal("approve", { approvedBy: "ops" });
		await handle.waitForCompletion();

		await assert.rejects(
			() => handle.signal("approve", { approvedBy: "ops" }),
			MissionSignalError,
		);
	},
);

test(
	"public API: invalid signal payload variants are rejected",
	{ timeout: TEST_TIMEOUT_MS },
	async () => {
		const mission = createApprovalMission("invalid-signal-input");
		const commander = createCommander({ definitions: [mission] });
		await commander.waitUntilReady();
		const handle = await commander.start(mission, { id: "id-1" });

		await assert.rejects(
			() => handle.signal("approve", undefined as never),
			MissionValidationError,
		);
		await assert.rejects(
			() => handle.signal("approve", null as never),
			MissionValidationError,
		);
		await assert.rejects(
			() => handle.signal("approve", {} as never),
			MissionValidationError,
		);
		await assert.rejects(
			() =>
				handle.signal("approve", { approvedBy: "ops", extra: true } as never),
			MissionValidationError,
		);
	},
);

test(
	"public API: start payload with extra fields can be rejected by strict parser",
	{ timeout: TEST_TIMEOUT_MS },
	async () => {
		const mission = createApprovalMission("strict-start");
		const commander = createCommander({ definitions: [mission] });
		await commander.waitUntilReady();

		const handle = commander.createMission(mission);
		await assert.rejects(
			() => handle.start({ id: "ok", extra: true } as never),
			MissionValidationError,
		);
		assert.equal(handle.status, "failed");
	},
);

test(
	"public API: duplicate concurrent signals only apply once",
	{ timeout: TEST_TIMEOUT_MS },
	async () => {
		const mission = createApprovalMission("duplicate-concurrent-signals");
		const commander = createCommander({ definitions: [mission] });
		await commander.waitUntilReady();
		const handle = await commander.start(mission, { id: "id-2" });

		const [first, second] = await Promise.allSettled([
			handle.signal("approve", { approvedBy: "ops-a" }),
			handle.signal("approve", { approvedBy: "ops-b" }),
		]);

		const statuses = [first.status, second.status].sort();
		assert.deepEqual(statuses, ["fulfilled", "rejected"]);

		const snapshot = await handle.waitForCompletion();
		assert.equal(snapshot.status, "completed");
	},
);

test(
	"public API: signaling while sleeping is rejected",
	{ timeout: TEST_TIMEOUT_MS },
	async () => {
		const mission = m
			.define("signal-during-sleep")
			.start({
				input: { parse: parseStrictStart },
				run: async ({ ctx }) => ({ id: ctx.events.start.input.id }),
			})
			.sleep("pause", 20)
			.needTo("approve", { parse: parseStrictApproval })
			.end();

		const commander = createCommander({ definitions: [mission] });
		await commander.waitUntilReady();
		const handle = await commander.start(mission, { id: "sleepy" });

		await assert.rejects(
			() => handle.signal("approve", { approvedBy: "ops" }),
			MissionSignalError,
		);
		await new Promise<void>((resolve) => {
			setTimeout(resolve, 30);
		});
		await handle.signal("approve", { approvedBy: "ops" });
		await handle.waitForCompletion();
	},
);

test(
	"public API: signaling while retry backoff wait is active is rejected",
	{ timeout: TEST_TIMEOUT_MS },
	async () => {
		let attempts = 0;
		const mission = m
			.define("signal-during-retry")
			.start({
				input: { parse: parseStrictStart },
				run: async () => ({ ok: true }),
			})
			.step(
				"unstable",
				async () => {
					attempts += 1;
					if (attempts < 2) {
						throw new Error("transient");
					}
					return { ok: true };
				},
				{ retry: { maxAttempts: 2, initialIntervalMs: 20 } },
			)
			.needTo("approve", { parse: parseStrictApproval })
			.end();

		const commander = createCommander({ definitions: [mission] });
		await commander.waitUntilReady();
		const handle = await commander.start(mission, { id: "retry" });
		assert.equal(handle.status, "waiting");
		assert.equal(handle.inspect().snapshot.waiting?.kind, "retry");

		await assert.rejects(
			() => handle.signal("approve", { approvedBy: "ops" }),
			MissionSignalError,
		);

		await new Promise<void>((resolve) => {
			setTimeout(resolve, 40);
		});
		assert.equal(handle.inspect().snapshot.waiting?.kind, "signal");
		await handle.signal("approve", { approvedBy: "ops" });
		await handle.waitForCompletion();
	},
);

test(
	"public API: cancelling twice is idempotent",
	{ timeout: TEST_TIMEOUT_MS },
	async () => {
		const mission = createApprovalMission("cancel-idempotent");
		const commander = createCommander({ definitions: [mission] });
		await commander.waitUntilReady();

		const handle = await commander.start(mission, { id: "cancel-1" });
		const first = await handle.cancel("operator requested cancellation");
		const second = await handle.cancel("different reason later");

		assert.equal(first.status, "cancelled");
		assert.equal(second.status, "cancelled");
		assert.equal(second.error?.message, "operator requested cancellation");
	},
);

test(
	"public API: duplicate mission ids should be rejected to prevent accidental overwrite",
	{ timeout: TEST_TIMEOUT_MS },
	async () => {
		const mission = createApprovalMission("duplicate-id");
		const commander = createCommander({ definitions: [mission] });
		await commander.waitUntilReady();

		const first = commander.createMission(mission, {
			missionId: "duplicate-1",
		});
		await first.start({ id: "first" });

		assert.throws(
			() => commander.createMission(mission, { missionId: "duplicate-1" }),
			/error|duplicate|exists/i,
		);
	},
);
