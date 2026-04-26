import type { RetryPolicy } from "./retry-policy.ts";
import type { AnyInputSchema, iInferInput } from "./schema.ts";
import type { NeedToOptions, SleepResult } from "./timer.ts";
import type { MissionInspection } from "./contracts.d.ts";

export interface EventRecord {
	input?: unknown;
	output?: unknown;
}

export type EventsMap = Record<string, EventRecord>;

export interface MissionContext<E extends EventsMap = EventsMap> {
	missionId: string;
	events: E;
}

export type AddEvent<
	E extends EventsMap,
	Name extends string,
	Rec extends EventRecord,
> = E & { [K in Name]: Rec };

export type AssertNewEventName<
	E extends EventsMap,
	N extends string,
> = N extends keyof E ? never : N;

export interface StartNode {
	kind: "start";
	inputSchema: AnyInputSchema;
	run: (args: { ctx: MissionContext }) => Promise<unknown>;
}

export interface StepNode {
	kind: "step";
	name: string;
	run: (args: { ctx: MissionContext }) => Promise<unknown>;
	retryPolicy: RetryPolicy;
}

export interface NeedToNode {
	kind: "needTo";
	name: string;
	inputSchema: AnyInputSchema;
	timeout?: NeedToOptions["timeout"];
}

export interface SleepNode {
	kind: "sleep";
	name: string;
	durationMs: number;
}

export interface EndNode {
	kind: "end";
}

export interface MissionQueryDefinition {
	name: string;
	run: (args: {
		ctx: MissionContext;
		inspection: MissionInspection;
	}) => Promise<unknown> | unknown;
}

export interface MissionUpdateDefinition {
	name: string;
	inputSchema: AnyInputSchema;
	run: (args: {
		ctx: MissionContext;
		input: unknown;
		inspection: MissionInspection;
	}) => Promise<unknown> | unknown;
}

export interface MissionScheduleDefinition {
	name: string;
	cron?: string;
	every?: string;
	overlapPolicy?: "allow" | "skip" | "buffer";
}

export type MissionNode =
	| StartNode
	| StepNode
	| NeedToNode
	| SleepNode
	| EndNode;

export interface MissionStaticDefinition {
	missionName: string;
	nodes: Array<
		| { kind: "start" }
		| { kind: "step"; name: string; retryPolicy: RetryPolicy }
		| { kind: "needTo"; name: string; timeout?: NeedToOptions["timeout"] }
		| { kind: "sleep"; name: string; durationMs: number }
		| { kind: "end" }
	>;
	queries: Array<{ name: string }>;
	updates: Array<{ name: string }>;
	schedules: MissionScheduleDefinition[];
}

export interface MissionDefinition<E extends EventsMap = EventsMap> {
	missionName: string;
	nodes: MissionNode[];
	queries: MissionQueryDefinition[];
	updates: MissionUpdateDefinition[];
	schedules: MissionScheduleDefinition[];
	toStatic(): MissionStaticDefinition;
	context: MissionContext<E>;
}

export type ExternalEventNames<M extends MissionDefinition> = {
	[K in keyof M["context"]["events"]]: M["context"]["events"][K] extends {
		input: unknown;
	}
		? K extends "start"
			? never
			: M["context"]["events"][K] extends { output: unknown }
				? never
				: K
		: never;
}[keyof M["context"]["events"]];

export type SleepEventRecord = { output: SleepResult };

export type NeedToInput<S extends AnyInputSchema> = { input: iInferInput<S> };
