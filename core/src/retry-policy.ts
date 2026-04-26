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

function assertFiniteNonNegativeNumber(name: string, value: number): void {
	if (!Number.isFinite(value) || value < 0) {
		throw new Error(`${name} must be a finite non-negative number.`);
	}
}

export function normalizeRetryPolicy(options?: RetryOptions): RetryPolicy {
	const retryPolicy = {
		...DEFAULT_RETRY_POLICY,
		...options?.retry,
	};

	if (
		!Number.isInteger(retryPolicy.maxAttempts) ||
		retryPolicy.maxAttempts <= 0
	) {
		throw new Error("maxAttempts must be a finite positive integer.");
	}
	assertFiniteNonNegativeNumber(
		"initialIntervalMs",
		retryPolicy.initialIntervalMs,
	);
	assertFiniteNonNegativeNumber(
		"backoffMultiplier",
		retryPolicy.backoffMultiplier,
	);
	if (retryPolicy.maxIntervalMs !== undefined) {
		assertFiniteNonNegativeNumber("maxIntervalMs", retryPolicy.maxIntervalMs);
	}

	return retryPolicy;
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
