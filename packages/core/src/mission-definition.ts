import { MissionDefinitionError } from "./errors.js";
import { normalizeRetryPolicy, type RetryOptions } from "./retry-policy.js";
import type { AnyInputSchema, InferInput } from "./schema.js";
import type {
	AddEvent,
	AssertNewEventName,
	EndNode,
	EventsMap,
	MissionContext,
	MissionDefinition,
	MissionNode,
	MissionStaticDefinition,
	NeedToInput,
	NeedToNode,
	SleepEventRecord,
	SleepNode,
	StartNode,
	StepNode,
} from "./types.js";
import type { NeedToOptions } from "./timer.js";

type ChainBuilder<E extends EventsMap> = {
	step<EventName extends string, Output extends object>(
		eventName: AssertNewEventName<E, EventName>,
		run: (args: { ctx: MissionContext<E> }) => Promise<Output>,
		options?: RetryOptions,
	): ChainBuilder<AddEvent<E, EventName, { output: Output }>>;

	needTo<EventName extends string, S extends AnyInputSchema>(
		eventName: AssertNewEventName<E, EventName>,
		inputSchema: S,
		options?: NeedToOptions,
	): ChainBuilder<AddEvent<E, EventName, NeedToInput<S>>>;

	sleep<EventName extends string>(
		eventName: AssertNewEventName<E, EventName>,
		durationMs: number,
	): ChainBuilder<AddEvent<E, EventName, SleepEventRecord>>;

	end(): MissionDefinition<E>;
};

type DefineBuilder<Name extends string> = {
	start<S extends AnyInputSchema, StartOutput extends object>(args: {
		input: S;
		run: (args: {
			ctx: MissionContext<{
				start: { input: InferInput<S> };
			}>;
		}) => Promise<StartOutput>;
	}): ChainBuilder<{
		start: { input: InferInput<S>; output: StartOutput };
	}>;
};

function assertDuration(durationMs: number) {
	if (!Number.isFinite(durationMs) || durationMs < 0) {
		throw new MissionDefinitionError(
			"Sleep duration must be a finite non-negative number.",
		);
	}
}

function toStaticNode(node: MissionNode): MissionStaticDefinition["nodes"][number] {
	if (node.kind === "start") {
		return { kind: "start" };
	}

	if (node.kind === "step") {
		return {
			kind: "step",
			name: node.name,
			retryPolicy: node.retryPolicy,
		};
	}

	if (node.kind === "needTo") {
		return {
			kind: "needTo",
			name: node.name,
			timeout: node.timeout,
		};
	}

	if (node.kind === "sleep") {
		return {
			kind: "sleep",
			name: node.name,
			durationMs: node.durationMs,
		};
	}

	return { kind: "end" };
}

function makeChainBuilder<E extends EventsMap>(
	missionName: string,
	nodes: MissionNode[],
): ChainBuilder<E> {
	return {
		step(eventName: string, run, options) {
			const nextNodes: MissionNode[] = [
				...nodes,
				{
					kind: "step",
					name: eventName,
					run,
					retryPolicy: normalizeRetryPolicy(options),
				} satisfies StepNode,
			];
			return makeChainBuilder<any>(missionName, nextNodes);
		},

		needTo(eventName: string, inputSchema, options) {
			const nextNodes: MissionNode[] = [
				...nodes,
				{
					kind: "needTo",
					name: eventName,
					inputSchema,
					timeout: options?.timeout,
				} satisfies NeedToNode,
			];
			return makeChainBuilder<any>(missionName, nextNodes);
		},

		sleep(eventName: string, durationMs: number) {
			assertDuration(durationMs);
			const nextNodes: MissionNode[] = [
				...nodes,
				{
					kind: "sleep",
					name: eventName,
					durationMs,
				} satisfies SleepNode,
			];
			return makeChainBuilder<any>(missionName, nextNodes);
		},

		end() {
			const finalNodes: MissionNode[] = [...nodes, { kind: "end" } satisfies EndNode];
			return {
				missionName,
				nodes: finalNodes,
				toStatic() {
					return {
						missionName,
						nodes: finalNodes.map(toStaticNode),
					};
				},
				context: null as unknown as MissionContext<E>,
			} satisfies MissionDefinition<E>;
		},
	};
}

export const m = {
	define<Name extends string>(missionName: Name): DefineBuilder<Name> {
		return {
			start(args) {
				const startNode: StartNode = {
					kind: "start",
					inputSchema: args.input,
					run: args.run,
				};

				return makeChainBuilder<any>(missionName, [startNode]);
			},
		};
	},
} as const;
