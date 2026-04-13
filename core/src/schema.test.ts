import assert from "node:assert/strict";
import test from "node:test";

import { MissionValidationError } from "./errors.ts";
import { parseMissionInput } from "./schema.ts";

test("parseMissionInput returns parsed data for valid input", () => {
	const schema = {
		parse: (input: unknown) => {
			const value = input as { email?: unknown };

			if (typeof value.email !== "string" || !value.email.includes("@")) {
				throw new Error("Invalid email");
			}

			return { email: value.email };
		},
	};

	const result = parseMissionInput("start", schema, {
		email: "hello@example.com",
	});

	assert.equal(result.email, "hello@example.com");
});

test("parseMissionInput throws MissionValidationError for invalid input", () => {
	const schema = {
		parse: (input: unknown) => {
			const value = input as { email?: unknown };

			if (typeof value.email !== "string" || !value.email.includes("@")) {
				throw new Error("Invalid email");
			}

			return { email: value.email };
		},
	};

	assert.throws(
		() =>
			parseMissionInput("start", schema, {
				email: "bad-email",
			}),
		(error) =>
			error instanceof MissionValidationError && error.eventName === "start",
	);
});
