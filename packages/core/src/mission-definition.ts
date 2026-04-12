import { MissionDefinitionError } from "./errors.ts";
import { normalizeRetryPolicy, type RetryOptions } from "./retry-policy.ts";
import type { AnyInputSchema, iInferInput } from "./schema.ts";
import type { NeedToOptions } from "./timer.ts";
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
	SleepEventRecord,
	StartNode,
	StepNode,
} from "./types.ts";

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

type DefineBuilder<_Name extends string> = {
	start<S extends AnyInputSchema, StartOutput extends object>(args: {
		input: S;
		run: (args: {
			ctx: MissionContext<{
				start: { input: iInferInput<S> };
			}>;
		}) => Promise<StartOutput>;
	}): ChainBuilder<{
		start: { input: iInferInput<S>; output: StartOutput };
	}>;
};

function assertDuration(durationMs: number) {
	if (!Number.isFinite(durationMs) || durationMs < 0) {
		throw new MissionDefinitionError(
			"Sleep duration must be a finite non-negative number.",
		);
	}
}

function toStaticNode(
	node: MissionNode,
): MissionStaticDefinition["nodes"][number] {
	switch (node.kind) {
		case "start":
			return { kind: "start" };
		case "step":
			return {
				kind: "step",
				name: node.name,
				retryPolicy: node.retryPolicy,
			};
		case "needTo":
			return {
				kind: "needTo",
				name: node.name,
				timeout: node.timeout,
			};
		case "sleep":
			return {
				kind: "sleep",
				name: node.name,
				durationMs: node.durationMs,
			};
		case "end":
			return { kind: "end" };
	}
}

function makeChainBuilder<E extends EventsMap>(
	missionName: string,
	nodes: MissionNode[],
): ChainBuilder<E> {
	return {
		step(eventName, run, options) {
			const nextNodes: MissionNode[] = [
				...nodes,
				{
					kind: "step",
					name: eventName,
					run: run as StepNode["run"],
					retryPolicy: normalizeRetryPolicy(options),
				},
			];

			return makeChainBuilder<
				AddEvent<
					E,
					typeof eventName,
					{ output: Awaited<ReturnType<typeof run>> }
				>
			>(missionName, nextNodes);
		},

		needTo(eventName, inputSchema, options) {
			const nextNodes: MissionNode[] = [
				...nodes,
				{
					kind: "needTo",
					name: eventName,
					inputSchema,
					timeout: options?.timeout,
				},
			];

			return makeChainBuilder<
				AddEvent<E, typeof eventName, NeedToInput<typeof inputSchema>>
			>(missionName, nextNodes);
		},

		sleep(eventName, durationMs) {
			assertDuration(durationMs);

			const nextNodes: MissionNode[] = [
				...nodes,
				{
					kind: "sleep",
					name: eventName,
					durationMs,
				},
			];

			return makeChainBuilder<
				AddEvent<E, typeof eventName, SleepEventRecord>
			>(missionName, nextNodes);
		},

		end() {
			const finalNodes: MissionNode[] = [
				...nodes,
				{ kind: "end" } satisfies EndNode,
			];

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
					run: args.run as StartNode["run"],
				};

				return makeChainBuilder<{
					start: {
						input: iInferInput<typeof args.input>;
						output: Awaited<ReturnType<typeof args.run>>;
					};
				}>(missionName, [startNode]);
			},
		};
	},
} as const;