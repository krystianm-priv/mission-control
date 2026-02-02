import { eq } from "drizzle-orm";
import { db, userReviewRequests } from "./db.ts";

export const fakeMailer = async ({
	to: _to,
	content: _content,
}: {
	to: string;
	content: string;
}) => {
	return {
		success: true,
	};
};

export const fakeSpamChecker = async (content: string) => {
	return content.includes("spam");
};

export const createReviewRequestRecord = async (email: string) => {
	const recordId = await db
		.insert(userReviewRequests)
		.values({
			email,
			id: crypto.randomUUID(),
		})
		.returning();
	return recordId[0].id;
};

export const updateReviewRequestRecordWithReview = async (args: {
	id: string;
	review: string;
}) => {
	await db
		.update(userReviewRequests)
		.set({ received_review: args.review })
		.where(eq(userReviewRequests.id, args.id));
};
