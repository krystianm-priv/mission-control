import { MissionValidationError } from "./errors.ts";

export interface Schema<T = unknown> {
	parse: (input: unknown) => T;
}

export type RuntimeSchema<T = unknown> = Schema<T>;

export type AnyInputSchema = RuntimeSchema<unknown>;

export type Infer<S extends Schema<unknown>> =
	S extends Schema<infer T> ? T : never;

export type iInferInput<S extends AnyInputSchema> =
	S extends Schema<infer T> ? T : never;

export function isRuntimeSchema(value: unknown): value is RuntimeSchema {
	return Boolean(
		value &&
			typeof value === "object" &&
			typeof (value as Schema).parse === "function",
	);
}

export function parseMissionInput<T>(
	eventName: string,
	schema: RuntimeSchema<T> | undefined,
	input: unknown,
): T {
	if (!schema) {
		return input as T;
	}

	try {
		return schema.parse(input);
	} catch (error) {
		throw new MissionValidationError(eventName, error);
	}
}
