import type { z } from "zod";

/* =========================================================
 * Generic Schema (library-agnostic)
 * ======================================================= */

export interface Schema<T = unknown> {
	/** Phantom type carrier (TypeScript only). */
	readonly _type?: T;
}

/** Your generic schema inference */
export type Infer<S extends Schema<any>> =
	S extends Schema<infer T> ? T : never;

/* =========================================================
 * Zod autodetection
 * ======================================================= */

/**
 * Accept either:
 * - any Zod schema (autoinfer via z.infer)
 * - any Schema<T> (autoinfer via phantom type)
 */
export type AnyInputSchema = z.ZodTypeAny | Schema<any>;

/** Autodetect inference: Zod -> z.infer, else -> Infer<Schema> */
export type InferInput<S extends AnyInputSchema> = S extends z.ZodTypeAny
	? z.infer<S>
	: S extends Schema<infer T>
		? T
		: never;

/* =========================================================
 * Context + Events
 * ======================================================= */

type EventRecord = {
	input?: unknown;
	output?: unknown;
};

type EventsMap = Record<string, EventRecord>;

export type MissionContext<E extends EventsMap> = {
	missionId: string;
	events: E;
};

type AddEvent<
	E extends EventsMap,
	Name extends string,
	Rec extends EventRecord,
> = E & { [K in Name]: Rec };

type AssertNewEventName<
	E extends EventsMap,
	N extends string,
> = N extends keyof E ? never : N;

/* =========================================================
 * Nodes (not orchestration, just definition)
 * ======================================================= */

type StartNode = {
	kind: "start";
	inputSchema: AnyInputSchema; // keep the schema object (zod or generic)
	run: (args: { ctx: MissionContext<any> }) => Promise<any>;
};

type StepNode = {
	kind: "step";
	name: string;
	run: (args: { ctx: MissionContext<any> }) => Promise<any>;
};

type NeedToNode = {
	kind: "needTo";
	name: string;
	inputSchema: AnyInputSchema; // schema-agnostic
};

type EndNode = {
	kind: "end";
};

type MissionNode = StartNode | StepNode | NeedToNode | EndNode;

/* =========================================================
 * Static JSON definition
 * ======================================================= */

export type MissionStaticDefinition = {
	missionName: string;
	nodes: Array<
		| { kind: "start" }
		| { kind: "step"; name: string }
		| { kind: "needTo"; name: string }
		| { kind: "end" }
	>;
};

/* =========================================================
 * Mission Definition
 * ======================================================= */

export type MissionDefinition<E extends EventsMap> = {
	missionName: string;

	/** Contains schemas + step fns (for commander later). */
	nodes: MissionNode[];

	/** JSON-like (no schemas, no functions). */
	toStatic(): MissionStaticDefinition;

	/** Type-only: final context shape */
	context: MissionContext<E>;
};

/* =========================================================
 * Builder types
 * ======================================================= */

type ChainBuilder<E extends EventsMap> = {
	step<EventName extends string, Output extends object>(
		eventName: AssertNewEventName<E, EventName>,
		run: (args: { ctx: MissionContext<E> }) => Promise<Output>,
	): ChainBuilder<AddEvent<E, EventName, { output: Output }>>;

	needTo<EventName extends string, S extends AnyInputSchema>(
		eventName: AssertNewEventName<E, EventName>,
		inputSchema: S,
	): ChainBuilder<AddEvent<E, EventName, { input: InferInput<S> }>>;

	end(): MissionDefinition<E>;
};

type DefineBuilder<Name extends string> = {
	start<S extends AnyInputSchema, StartOutput extends object>(args: {
		input: S;

		/** start sees only start.input */
		run: (args: {
			ctx: MissionContext<{
				start: { input: InferInput<S> };
			}>;
		}) => Promise<StartOutput>;
	}): ChainBuilder<{
		start: { input: InferInput<S>; output: StartOutput };
	}>;
};

/* =========================================================
 * Runtime builder (still "TS-only": builds node list)
 * ======================================================= */

function makeChainBuilder<E extends EventsMap>(
	missionName: string,
	nodes: MissionNode[],
): ChainBuilder<E> {
	return {
		step(eventName: any, run: any) {
			const nextNodes: MissionNode[] = [
				...nodes,
				{ kind: "step", name: eventName, run } as StepNode,
			];
			return makeChainBuilder<any>(missionName, nextNodes) as any;
		},

		needTo(eventName: any, inputSchema: AnyInputSchema) {
			const nextNodes: MissionNode[] = [
				...nodes,
				{ kind: "needTo", name: eventName, inputSchema } as NeedToNode,
			];
			return makeChainBuilder<any>(missionName, nextNodes) as any;
		},

		end() {
			const finalNodes: MissionNode[] = [...nodes, { kind: "end" } as EndNode];

			const def: MissionDefinition<any> = {
				missionName,
				nodes: finalNodes,

				toStatic() {
					return {
						missionName,
						nodes: finalNodes.map((n) => {
							if (n.kind === "start") return { kind: "start" as const };
							if (n.kind === "step")
								return { kind: "step" as const, name: n.name };
							if (n.kind === "needTo")
								return { kind: "needTo" as const, name: n.name };
							return { kind: "end" as const };
						}),
					};
				},

				// type-only
				context: null as any,
			};

			return def as MissionDefinition<E>;
		},
	};
}

/* =========================================================
 * The full `m` object
 * ======================================================= */

export const m = {
	define<Name extends string>(missionName: Name): DefineBuilder<Name> {
		return {
			start(args) {
				const startNode: StartNode = {
					kind: "start",
					inputSchema: args.input,
					run: args.run as any,
				};

				return makeChainBuilder<any>(missionName, [startNode]) as any;
			},
		};
	},
} as const;
