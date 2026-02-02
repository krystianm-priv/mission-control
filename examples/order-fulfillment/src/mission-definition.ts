import { z } from "zod";
import { m } from "@mission-control/core";
import {
	fakeCreateShipment,
	fakeInventoryCheck,
	fakeNotifyCustomer,
	fakeReserveInventory,
} from "./utils.ts";

export const orderFulfillmentMission = m
	.define("order-fulfillment")
	.start({
		input: z.strictObject({
			orderId: z.string(),
			email: z.email(),
			sku: z.string(),
			quantity: z.number().int().positive(),
			shippingAddress: z.string(),
		}),
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
	.needTo(
		"confirm-payment",
		z.strictObject({
			paymentId: z.string(),
			amount: z.number().positive(),
			currency: z.string().length(3),
		}),
	)
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
	.needTo(
		"confirm-delivery",
		z.strictObject({
			deliveredAt: z.string(),
			receivedBy: z.string(),
		}),
	)
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
