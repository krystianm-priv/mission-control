import { m } from "@mission-control/core";
import { z } from "zod/v4";
import {
	createReviewRequestRecord,
	fakeMailer,
	fakeSpamChecker,
	updateReviewRequestRecordWithReview,
} from "./utils.ts";

export const askForReviewMission = m
	.define("ask-for-review")
	.start({
		input: {
			parse: (i: unknown) => {
				const schema = z.object({
					email: z.email(),
				});
				return schema.parse(i);
			},
		},
		run: async ({ ctx }) => {
			return {
				recordId: await createReviewRequestRecord(ctx.events.start.input.email),
			};
		},
	})
	.step("send-email", async ({ ctx }) => {
		return fakeMailer({
			to: ctx.events.start.input.email,
			content: `Please review the item with missionId: ${ctx.missionId}`,
		});
	})
	.needTo("receive-review", z.string())
	.step("anti-spam", async ({ ctx }) => {
		return {
			isSpam: await fakeSpamChecker(ctx.events["receive-review"].input),
		};
	})
	.step("update-record", async ({ ctx }) => {
		if (ctx.events["anti-spam"].output.isSpam) {
			throw new Error("Review content detected as spam.");
		}
		await updateReviewRequestRecordWithReview({
			id: ctx.events.start.output.recordId,
			review: ctx.events["receive-review"].input,
		});
		console.log(
			"Review record updated successfully. The review was:",
			ctx.events["receive-review"].input,
		);
		return {};
	})
	.end();
