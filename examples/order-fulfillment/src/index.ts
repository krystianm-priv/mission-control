import { createCommander } from "@mission-control/core";
import { orderFulfillmentMission } from "./mission-definition.ts";

const commander = createCommander({
	definitions: [orderFulfillmentMission],
});
const mission = await commander.start(orderFulfillmentMission, {
	orderId: "order-1001",
	email: "buyer@example.com",
	sku: "sku-apple-001",
	quantity: 2,
	shippingAddress: "100 Example Blvd, Sample City",
});

setTimeout(() => {
	void mission.signal("confirm-payment", {
		paymentId: "pay-9012",
		amount: 59.99,
		currency: "USD",
	});
}, 100);

setTimeout(() => {
	void mission.signal("confirm-delivery", {
		deliveredAt: new Date().toISOString(),
		receivedBy: "Alex P.",
	});
}, 200);

await mission.waitForCompletion();
console.log(mission.inspect());
