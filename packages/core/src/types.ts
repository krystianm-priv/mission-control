import type { RetryPolicy } from "./retry-policy.js";
import type { AnyInputSchema, InferInput } from "./schema.js";
import type { NeedToOptions, SleepResult } from "./timer.js";

export interface EventRecord {
	input?: unknown;
	output?: unknown;
}

export type EventsMap = Record<string, EventRecord>;

export interface MissionContext<E extends EventsMap> {
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
	run: (args: { ctx: MissionContext<any> }) => Promise<any>;
}

export interface StepNode {
	kind: "step";
	name: string;
	run: (args: { ctx: MissionContext<any> }) => Promise<any>;
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
}

export interface MissionDefinition<E extends EventsMap> {
	missionName: string;
	nodes: MissionNode[];
	toStatic(): MissionStaticDefinition;
	context: MissionContext<E>;
}

export type ExternalEventNames<M extends MissionDefinition<any>> = {
	[K in keyof M["context"]["events"]]: M["context"]["events"][K] extends {
		input: any;
	}
		? M["context"]["events"][K] extends { output: any }
			? never
			: K
		: never;
}[keyof M["context"]["events"]];

export type SleepEventRecord = { output: SleepResult };

export type NeedToInput<S extends AnyInputSchema> = { input: InferInput<S> };
