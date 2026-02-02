export const fakeInventoryCheck = async (sku: string, quantity: number) => {
	return {
		sku,
		available: quantity <= 5,
		availableQuantity: 5,
	};
};

export const fakeReserveInventory = async (sku: string, quantity: number) => {
	return {
		sku,
		quantity,
		reservationId: `reserve-${Math.random().toString(16).slice(2)}`,
	};
};

export const fakeCreateShipment = async (args: {
	orderId: string;
	address: string;
}) => {
	return {
		shipmentId: `ship-${Math.random().toString(16).slice(2)}`,
		carrier: "ExampleCarrier",
		trackingNumber: `TRACK-${Math.random().toString(16).slice(2)}`,
		orderId: args.orderId,
		address: args.address,
	};
};

export const fakeNotifyCustomer = async (email: string, message: string) => {
	return {
		email,
		message,
		sent: true,
	};
};
