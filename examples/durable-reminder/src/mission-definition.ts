import { m } from "@mission-control/core";

function parseReminderInput(input: unknown) {
	const value = input as { recipient?: unknown; message?: unknown };

	if (
		typeof value.recipient !== "string" ||
		!value.recipient.includes("@") ||
		typeof value.message !== "string" ||
		value.message.length < 1
	) {
		throw new Error("Invalid durable reminder input.");
	}

	return {
		recipient: value.recipient,
		message: value.message,
	};
}

export const durableReminderMission = m
	.define("durable-reminder")
	.start({
		input: { parse: parseReminderInput },
		run: async ({ ctx }) => ({
			recipient: ctx.events.start.input.recipient,
			message: ctx.events.start.input.message,
		}),
	})
	.sleep("wait-before-send", 1_000)
	.step("send-reminder", async ({ ctx }) => ({
		sentTo: ctx.events.start.output.recipient,
		body: ctx.events.start.output.message,
	}))
	.end();
