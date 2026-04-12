import type { z } from "zod/v4";

import { MissionValidationError } from "./errors.js";

export interface Schema<T = unknown> {
	readonly _type?: T;
	readonly parse?: (input: unknown) => T;
	readonly safeParse?: (
		input: unknown,
	) => { success: true; data: T } | { success: false; error: unknown };
}

export type RuntimeSchema<T = unknown> = z.ZodType<T> | Schema<T>;

export type AnyInputSchema = RuntimeSchema<unknown>;

export type Infer<S extends Schema<unknown>> =
	S extends Schema<infer T> ? T : never;

export type InferInput<S extends AnyInputSchema> = S extends z.ZodTypeAny
	? z.infer<S>
	: S extends Schema<infer T>
		? T
		: never;

export function isRuntimeSchema(value: unknown): value is RuntimeSchema {
	return Boolean(
		value &&
			typeof value === "object" &&
			("parse" in value || "safeParse" in value),
	);
}

export function parseMissionInput<T>(
	eventName: string,
	schema: RuntimeSchema<T>,
	input: unknown,
): T {
	if ("safeParse" in schema && typeof schema.safeParse === "function") {
		const result = schema.safeParse(input);
		if (result.success) {
			return result.data;
		}
		throw new MissionValidationError(eventName, result.error);
	}

	if ("parse" in schema && typeof schema.parse === "function") {
		try {
			return schema.parse(input);
		} catch (error) {
			throw new MissionValidationError(eventName, error);
		}
	}

	return input as T;
}
