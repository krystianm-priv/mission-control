import assert from "node:assert/strict";
import test from "node:test";

import {
	type MissionHandle,
	createCommander,
	m,
} from "@mission-control/core";

const expectType = <T>(_value: T): void => {};

const checkoutMission = m
	.define("checkout")
	.query("current-order", ({ inspection }) => inspection.snapshot.missionId)
	.update(
		"set-note",
		{
			parse: (input) => {
				const value = input as { note?: unknown };
				if (typeof value.note !== "string") {
					throw new Error("Invalid note.");
				}
				return { note: value.note };
			},
		},
		({ input }) => input.note,
	)
	.start({
		input: {
			parse: (input) => {
				const value = input as { orderId?: unknown; amount?: unknown };
				if (typeof value.orderId !== "string") {
					throw new Error("Invalid order id.");
				}
				if (typeof value.amount !== "number") {
					throw new Error("Invalid amount.");
				}
				return { orderId: value.orderId, amount: value.amount };
			},
		},
		run: async ({ ctx }) => ({
			orderId: ctx.events.start.input.orderId,
			amount: ctx.events.start.input.amount,
		}),
	})
	.needTo("approve", {
		parse: (input) => {
			const value = input as { approvedBy?: unknown };
			if (typeof value.approvedBy !== "string") {
				throw new Error("Invalid approver.");
			}
			return { approvedBy: value.approvedBy };
		},
	})
	.step("finalize", async ({ ctx }) => ({
		approvedBy: ctx.events.approve.input.approvedBy,
		amount: ctx.events.start.output.amount,
	}))
	.end();

const compileTimeAssertions = () => {
	expectType<string>(checkoutMission.missionName);

	type ApproveInput =
		typeof checkoutMission.context.events.approve.input;
	const validApproveInput: ApproveInput = { approvedBy: "ops" };
	expectType<{ approvedBy: string }>(validApproveInput);

	type StartInput = typeof checkoutMission.context.events.start.input;
	const validStartInput: StartInput = { orderId: "o-1", amount: 10 };
	expectType<{ orderId: string; amount: number }>(validStartInput);

	const commander = createCommander({ definitions: [checkoutMission] });
	const createHandle = commander.createMission(checkoutMission);
	expectType<MissionHandle<typeof checkoutMission>>(createHandle);

	expectType<Promise<void>>(
		createHandle.start({ orderId: "o-2", amount: 25 }),
	);
	expectType<Promise<void>>(
		createHandle.signal("approve", { approvedBy: "operator" }),
	);

	const startByDefinition = commander.start(checkoutMission, {
		orderId: "o-3",
		amount: 30,
	});
	expectType<Promise<MissionHandle<typeof checkoutMission>>>(
		startByDefinition,
	);

	const startByName = commander.start<typeof checkoutMission>("checkout", {
		orderId: "o-4",
		amount: 35,
	});
	expectType<Promise<MissionHandle<typeof checkoutMission>>>(startByName);

	const retrievedById = commander.getMission<typeof checkoutMission>("some-id");
	expectType<Promise<MissionHandle<typeof checkoutMission> | undefined>>(
		retrievedById,
	);

	// @ts-expect-error unknown signal event names are not accepted
	void createHandle.signal("unknown-event", { approvedBy: "ops" });
	// @ts-expect-error signal payload must match the mission input schema
	void createHandle.signal("approve", { approvedBy: 123 });
	// @ts-expect-error start payload must match inferred start input type
	void createHandle.start({ orderId: "o-5", amount: "40" });
};

void compileTimeAssertions;

test("typed mission handles preserve runtime behavior for start/get/signal", async () => {
	const commander = createCommander({
		definitions: [checkoutMission],
		createMissionId: () => "typed-handle-1",
	});
	await commander.waitUntilReady();

	const handle = commander.createMission(checkoutMission, {
		missionId: "typed-get-1",
	});
	await handle.start({ orderId: "order-123", amount: 99 });

	const retrieved = await commander.getMission<typeof checkoutMission>(
		"typed-get-1",
	);
	assert.ok(retrieved);
	if (!retrieved) {
		assert.fail("Expected mission handle to be retrievable.");
	}

	await retrieved.signal("approve", { approvedBy: "ops" });
	const snapshot = await retrieved.waitForCompletion();

	assert.equal(snapshot.status, "completed");
	assert.deepEqual(retrieved.inspect().snapshot.ctx.events["finalize"]?.output, {
		approvedBy: "ops",
		amount: 99,
	});

	const direct = await commander.start(checkoutMission, {
		orderId: "order-456",
		amount: 15,
	});
	await direct.signal("approve", { approvedBy: "qa" });
	const directSnapshot = await direct.waitForCompletion();
	assert.equal(directSnapshot.status, "completed");
});
