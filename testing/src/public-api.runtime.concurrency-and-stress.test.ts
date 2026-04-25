import assert from "node:assert/strict";
import test from "node:test";

import { createCommander, m } from "@mission-control/core";

const TEST_TIMEOUT_MS = 12_000;

function parseId(input: unknown): { id: string } {
	const value = input as { id?: unknown };
	if (typeof value.id !== "string") {
		throw new Error("Invalid id.");
	}
	return { id: value.id };
}

test(
	"stress: starts many missions in parallel and completes all",
	{ timeout: TEST_TIMEOUT_MS },
	async () => {
	const mission = m
		.define("bulk-start")
		.start({
			input: { parse: parseId },
			run: async ({ ctx }) => ({ id: ctx.events.start.input.id }),
		})
		.needTo("approve", {
			parse: (input) => {
				const value = input as { actor?: unknown };
				if (typeof value.actor !== "string") {
					throw new Error("Invalid actor.");
				}
				return { actor: value.actor };
			},
		})
		.step("finalize", async ({ ctx }) => ({
			id: ctx.events.start.output.id,
			actor: ctx.events.approve.input.actor,
		}))
		.end();

	let sequence = 0;
	const commander = createCommander({
		definitions: [mission],
		createMissionId: () => `bulk-${sequence++}`,
	});
	await commander.waitUntilReady();

	const count = 75;
	const handles = await Promise.all(
		Array.from({ length: count }, (_, i) =>
			commander.start(mission, { id: `id-${i}` }),
		),
	);
	assert.equal(handles.length, count);

	await Promise.all(
		handles.map((handle, i) =>
			handle.signal("approve", {
				actor: `actor-${i}`,
			}),
		),
	);

	const snapshots = await Promise.all(
		handles.map((handle) => handle.waitForCompletion()),
	);
	assert.equal(
		snapshots.every((snapshot) => snapshot.status === "completed"),
		true,
	);
},
);

test(
	"stress: one commander can run multiple mission definitions concurrently",
	{ timeout: TEST_TIMEOUT_MS },
	async () => {
	const missionA = m
		.define("multi-a")
		.start({
			input: { parse: parseId },
			run: async ({ ctx }) => ({ id: ctx.events.start.input.id, type: "A" }),
		})
		.end();

	const missionB = m
		.define("multi-b")
		.start({
			input: {
				parse: (input) => {
					const value = input as { key?: unknown };
					if (typeof value.key !== "number") {
						throw new Error("Invalid key.");
					}
					return { key: value.key };
				},
			},
			run: async ({ ctx }) => ({ key: ctx.events.start.input.key, type: "B" }),
		})
		.end();

	const commander = createCommander({ definitions: [missionA, missionB] });
	await commander.waitUntilReady();

	const [a1, a2, b1, b2] = await Promise.all([
		commander.start(missionA, { id: "a-1" }),
		commander.start(missionA, { id: "a-2" }),
		commander.start(missionB, { key: 100 }),
		commander.start(missionB, { key: 200 }),
	]);

	const [sa1, sa2, sb1, sb2] = await Promise.all([
		a1.waitForCompletion(),
		a2.waitForCompletion(),
		b1.waitForCompletion(),
		b2.waitForCompletion(),
	]);

	assert.equal(sa1.status, "completed");
	assert.equal(sa2.status, "completed");
	assert.equal(sb1.status, "completed");
	assert.equal(sb2.status, "completed");
},
);

test(
	"stress: concurrent starts with same mission id should allow only one mission",
	{ timeout: TEST_TIMEOUT_MS },
	async () => {
	const mission = m
		.define("same-id-concurrency")
		.start({ input: { parse: parseId }, run: async () => ({ ok: true }) })
		.needTo("approve", {
			parse: (input) => {
				const value = input as { actor?: unknown };
				if (typeof value.actor !== "string") {
					throw new Error("Invalid actor.");
				}
				return { actor: value.actor };
			},
		})
		.end();

	const commander = createCommander({ definitions: [mission] });
	await commander.waitUntilReady();

	const [first, second] = await Promise.allSettled([
		commander.start(mission, { id: "x" }, { missionId: "fixed-id" }),
		commander.start(mission, { id: "x" }, { missionId: "fixed-id" }),
	]);

	const statuses = [first.status, second.status].sort();
	assert.deepEqual(statuses, ["fulfilled", "rejected"]);
},
);

test(
	"stress: large payloads survive start, signal, and inspection",
	{ timeout: TEST_TIMEOUT_MS },
	async () => {
	const mission = m
		.define("large-payload")
		.start({
			input: {
				parse: (input) => {
					const value = input as { blob?: unknown };
					if (!Array.isArray(value.blob)) {
						throw new Error("Invalid blob.");
					}
					return { blob: value.blob as string[] };
				},
			},
			run: async ({ ctx }) => ({ length: ctx.events.start.input.blob.length }),
		})
		.needTo("approve", {
			parse: (input) => {
				const value = input as { note?: unknown };
				if (typeof value.note !== "string") {
					throw new Error("Invalid note.");
				}
				return { note: value.note };
			},
		})
		.end();

	const commander = createCommander({ definitions: [mission] });
	await commander.waitUntilReady();

	const blob = Array.from({ length: 5000 }, (_, i) => `item-${i}`);
	const handle = await commander.start(mission, { blob });
	await handle.signal("approve", { note: "ok" });
	const snapshot = await handle.waitForCompletion();

	assert.equal(snapshot.status, "completed");
	assert.equal(
		(
			handle.inspect().snapshot.ctx.events["start"]?.input as
				| { blob: string[] }
				| undefined
		)?.blob.length,
		5000,
	);
},
);

test(
	"stress: thrown non-Error values become string mission errors",
	{ timeout: TEST_TIMEOUT_MS },
	async () => {
	const mission = m
		.define("non-error-throw")
		.start({ input: { parse: parseId }, run: async () => ({ ok: true }) })
		.step("explode", async () => {
			throw "literal-crash";
		})
		.end();

	const commander = createCommander({ definitions: [mission] });
	await commander.waitUntilReady();
	const handle = commander.createMission(mission);
	await assert.rejects(() => handle.start({ id: "x" }));

	assert.equal(handle.status, "failed");
	assert.equal(handle.error?.message, "literal-crash");
	assert.equal(
		handle
			.getHistory()
			.some((entry) => entry.type === "mission-failed"),
		true,
	);
},
);

test(
	"stress: zero and tiny timers are handled deterministically",
	{ timeout: TEST_TIMEOUT_MS },
	async () => {
	const mission = m
		.define("timer-boundaries")
		.start({ input: { parse: parseId }, run: async () => ({ ok: true }) })
		.sleep("zero-delay", 0)
		.sleep("tiny-delay", 5)
		.end();

	const commander = createCommander({ definitions: [mission] });
	await commander.waitUntilReady();
	const handle = await commander.start(mission, { id: "timer" });

	assert.equal(handle.status, "waiting");
	await new Promise<void>((resolve) => {
		setTimeout(resolve, 20);
	});
	const snapshot = await handle.waitForCompletion();
	assert.equal(snapshot.status, "completed");
},
);
