import { m } from "@mission-control/core";
import {
	fakeCreateShipment,
	fakeInventoryCheck,
	fakeNotifyCustomer,
	fakeReserveInventory,
} from "./utils.ts";

function parseOrderInput(input: unknown) {
	const value = input as {
		orderId?: unknown;
		email?: unknown;
		sku?: unknown;
		quantity?: unknown;
		shippingAddress?: unknown;
	};

	if (
		typeof value.orderId !== "string" ||
		typeof value.email !== "string" ||
		!value.email.includes("@") ||
		typeof value.sku !== "string" ||
		typeof value.quantity !== "number" ||
		!Number.isInteger(value.quantity) ||
		value.quantity <= 0 ||
		typeof value.shippingAddress !== "string"
	) {
		throw new Error("Invalid order fulfillment input.");
	}

	return {
		orderId: value.orderId,
		email: value.email,
		sku: value.sku,
		quantity: value.quantity,
		shippingAddress: value.shippingAddress,
	};
}

function parsePaymentConfirmation(input: unknown) {
	const value = input as {
		paymentId?: unknown;
		amount?: unknown;
		currency?: unknown;
	};

	if (
		typeof value.paymentId !== "string" ||
		typeof value.amount !== "number" ||
		value.amount <= 0 ||
		typeof value.currency !== "string" ||
		value.currency.length !== 3
	) {
		throw new Error("Invalid payment confirmation.");
	}

	return {
		paymentId: value.paymentId,
		amount: value.amount,
		currency: value.currency,
	};
}

function parseDeliveryConfirmation(input: unknown) {
	const value = input as {
		deliveredAt?: unknown;
		receivedBy?: unknown;
	};

	if (
		typeof value.deliveredAt !== "string" ||
		typeof value.receivedBy !== "string"
	) {
		throw new Error("Invalid delivery confirmation.");
	}

	return {
		deliveredAt: value.deliveredAt,
		receivedBy: value.receivedBy,
	};
}

export const orderFulfillmentMission = m
	.define("order-fulfillment")
	.start({
		input: { parse: parseOrderInput },
		run: async ({ ctx }) => {
			const { sku, quantity } = ctx.events.start.input;
			return fakeInventoryCheck(sku, quantity);
		},
	})
	.step("reserve-inventory", async ({ ctx }) => {
		if (!ctx.events.start.output.available) {
			throw new Error("Inventory unavailable.");
		}
		return fakeReserveInventory(
			ctx.events.start.input.sku,
			ctx.events.start.input.quantity,
		);
	})
	.needTo("confirm-payment", { parse: parsePaymentConfirmation })
	.step("create-shipment", async ({ ctx }) => {
		return fakeCreateShipment({
			orderId: ctx.events.start.input.orderId,
			address: ctx.events.start.input.shippingAddress,
		});
	})
	.step("notify-shipment", async ({ ctx }) => {
		const { trackingNumber, carrier } = ctx.events["create-shipment"].output;
		return fakeNotifyCustomer(
			ctx.events.start.input.email,
			`Your order shipped via ${carrier}. Tracking: ${trackingNumber}`,
		);
	})
	.needTo("confirm-delivery", { parse: parseDeliveryConfirmation })
	.step("close-order", async ({ ctx }) => {
		const { orderId } = ctx.events.start.input;
		const { deliveredAt, receivedBy } = ctx.events["confirm-delivery"].input;
		return {
			orderId,
			status: "completed",
			deliveredAt,
			receivedBy,
		};
	})
	.end();
