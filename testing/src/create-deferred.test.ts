import assert from "node:assert/strict";
import test from "node:test";

import { createDeferred } from "./index.ts";

test("createDeferred resolves with a plain value", async () => {
	const deferred = createDeferred<number>();
	deferred.resolve(42);
	assert.equal(await deferred.promise, 42);
});

test("createDeferred resolves with a thenable", async () => {
	const deferred = createDeferred<number>();
	deferred.resolve(Promise.resolve(7));
	assert.equal(await deferred.promise, 7);
});

test("createDeferred rejects with provided reason", async () => {
	const deferred = createDeferred<number>();
	const error = new Error("boom");
	deferred.reject(error);
	await assert.rejects(deferred.promise, error);
});

test("createDeferred stays pending until explicitly settled", async () => {
	const deferred = createDeferred<number>();
	const marker = await Promise.race([
		deferred.promise.then(() => "settled" as const),
		Promise.resolve("pending" as const),
	]);

	assert.equal(marker, "pending");

	deferred.resolve(99);
	assert.equal(await deferred.promise, 99);
});

test("createDeferred only honors the first settlement", async () => {
	const deferred = createDeferred<string>();
	deferred.resolve("first");
	deferred.reject(new Error("second"));
	assert.equal(await deferred.promise, "first");
});
