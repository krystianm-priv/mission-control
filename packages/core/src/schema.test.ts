import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";

import { MissionValidationError } from "./errors.js";
import { parseMissionInput } from "./schema.js";

test("parseMissionInput returns parsed data for valid input", () => {
	const value = parseMissionInput(
		"start",
		z.strictObject({ email: z.email() }),
		{ email: "hello@example.com" },
	);

	assert.equal(value.email, "hello@example.com");
});

test("parseMissionInput throws MissionValidationError for invalid input", () => {
	assert.throws(
		() =>
			parseMissionInput("start", z.strictObject({ email: z.email() }), {
				email: "bad-email",
			}),
		(error) =>
			error instanceof MissionValidationError && error.eventName === "start",
	);
});
