import { m } from "@mission-control/core";
import { z } from "zod/v4";

export const durableReminderMission = m
	.define("durable-reminder")
	.start({
		input: z.strictObject({
			recipient: z.email(),
			message: z.string().min(1),
		}),
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
