export interface RetryPolicy {
	maxAttempts: number;
	initialIntervalMs: number;
	backoffMultiplier: number;
	maxIntervalMs?: number;
}

export interface RetryOptions {
	retry?: Partial<RetryPolicy>;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
	maxAttempts: 1,
	initialIntervalMs: 0,
	backoffMultiplier: 1,
};

export function normalizeRetryPolicy(options?: RetryOptions): RetryPolicy {
	return {
		...DEFAULT_RETRY_POLICY,
		...options?.retry,
	};
}

export function getRetryDelayMs(
	retryPolicy: RetryPolicy,
	attemptNumber: number,
): number {
	if (attemptNumber <= 1) {
		return 0;
	}

	const rawDelay =
		retryPolicy.initialIntervalMs *
		retryPolicy.backoffMultiplier ** (attemptNumber - 2);

	if (retryPolicy.maxIntervalMs === undefined) {
		return rawDelay;
	}

	return Math.min(rawDelay, retryPolicy.maxIntervalMs);
}
