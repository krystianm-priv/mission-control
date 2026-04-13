import { InMemoryCommander } from "@mission-control/in-memory-commander";
import { orderFulfillmentMission } from "./mission-definition.ts";

const commander = new InMemoryCommander({
	definitions: [orderFulfillmentMission],
});
const mission = commander.createMission(orderFulfillmentMission);

await mission.start({
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
