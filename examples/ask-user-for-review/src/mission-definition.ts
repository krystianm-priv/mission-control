import { m } from "@mission-control/core";
import {
	createReviewRequestRecord,
	fakeMailer,
	fakeSpamChecker,
	updateReviewRequestRecordWithReview,
} from "./utils.ts";

function parseEmailInput(input: unknown) {
	const value = input as { email?: unknown };

	if (typeof value.email !== "string" || !value.email.includes("@")) {
		throw new Error("Invalid review email.");
	}

	return { email: value.email };
}

function parseReviewInput(input: unknown) {
	if (typeof input !== "string" || input.length === 0) {
		throw new Error("Invalid review payload.");
	}

	return input;
}

export const askForReviewMission = m
	.define("ask-for-review")
	.start({
		input: { parse: parseEmailInput },
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
	.needTo("receive-review", { parse: parseReviewInput })
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
