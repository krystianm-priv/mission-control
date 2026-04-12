import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryCommander } from "@mission-control/in-memory-commander";
import {
	MissionValidationError,
	MissionSignalError,
} from "@mission-control/core";

import { orderFulfillmentMission } from "./mission-definition.ts";

const validInput = {
	orderId: "order-1",
	email: "user@example.com",
	sku: "sku-123",
	quantity: 1,
	shippingAddress: "123 Street",
};

test("e2e: full happy path", async () => {
	const commander = new InMemoryCommander({
		createMissionId: () => "order-1",
		definitions: [orderFulfillmentMission],
	});

	const mission = commander.createMission(orderFulfillmentMission);

	await mission.start(validInput);

	// should wait for payment
	assert.equal(mission.status, "waiting");

	await mission.signal("confirm-payment", {
		paymentId: "pay-1",
		amount: 100,
		currency: "USD",
	});

	// should wait for delivery confirmation
	assert.equal(mission.status, "waiting");

	await mission.signal("confirm-delivery", {
		deliveredAt: new Date().toISOString(),
		receivedBy: "John",
	});

	assert.equal(mission.status, "completed");

	const state = mission.inspect();

	// sanity checks
	assert.equal(
		(state.snapshot.ctx.events.start?.input as { orderId: string }).orderId,
		validInput.orderId,
	);

	assert.ok(state.snapshot.ctx.events["reserve-inventory"]?.output);
	assert.ok(state.snapshot.ctx.events["create-shipment"]?.output);
	assert.ok(state.snapshot.ctx.events["notify-shipment"]?.output);

	assert.equal(
		(state.snapshot.ctx.events["close-order"]?.output as { status: string }).status,
		"completed",
	);
});

test("e2e: invalid start input fails", async () => {
	const commander = new InMemoryCommander({
		createMissionId: () => "order-2",
		definitions: [orderFulfillmentMission],
	});

	const mission = commander.createMission(orderFulfillmentMission);

	await assert.rejects(
		() =>
			mission.start({
				...validInput,
				email: "bad-email",
			} as never),
		MissionValidationError,
	);

	assert.equal(mission.status, "failed");
});

test("e2e: invalid payment signal fails", async () => {
	const commander = new InMemoryCommander({
		createMissionId: () => "order-3",
		definitions: [orderFulfillmentMission],
	});

	const mission = commander.createMission(orderFulfillmentMission);

	await mission.start(validInput);

	await assert.rejects(
		() =>
			mission.signal("confirm-payment", {
				paymentId: "pay-1",
				amount: -1, // invalid
				currency: "USD",
			} as never),
		MissionValidationError,
	);

	assert.equal(mission.status, "failed");
});

test("e2e: wrong signal name fails", async () => {
	const commander = new InMemoryCommander({
		createMissionId: () => "order-4",
		definitions: [orderFulfillmentMission],
	});

	const mission = commander.createMission(orderFulfillmentMission);

	await mission.start(validInput);

	await assert.rejects(
		() =>
			mission.signal(
				"unknown" as never,
				{
					anything: true,
				} as never,
			),
		MissionSignalError,
	);
});

test("e2e: inventory unavailable fails early", async () => {
	const commander = new InMemoryCommander({
		createMissionId: () => "order-5",
		definitions: [orderFulfillmentMission],
	});

	const mission = commander.createMission(orderFulfillmentMission);

	// try forcing failure via quantity (depends on your fakeInventoryCheck logic)
	await assert.rejects(
		() =>
			mission.start({
				...validInput,
				quantity: 999999, // assume this triggers unavailable
			}),
		Error,
	);

	assert.equal(mission.status, "failed");
});
