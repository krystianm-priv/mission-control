const reviewRequests = new Map<string, { email: string; receivedReview?: string }>();

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
	const id = crypto.randomUUID();
	reviewRequests.set(id, { email });
	return id;
};

export const updateReviewRequestRecordWithReview = async (args: {
	id: string;
	review: string;
}) => {
	const current = reviewRequests.get(args.id);
	if (!current) {
		throw new Error(`Missing review request record "${args.id}".`);
	}
	reviewRequests.set(args.id, {
		...current,
		receivedReview: args.review,
	});
};
