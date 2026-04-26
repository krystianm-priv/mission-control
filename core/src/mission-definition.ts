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
	MissionQueryDefinition,
	MissionScheduleDefinition,
	MissionStaticDefinition,
	MissionUpdateDefinition,
	NeedToInput,
	SleepEventRecord,
	StartNode,
	StepNode,
} from "./types.d.ts";

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
	query(name: string, run: MissionQueryDefinition["run"]): DefineBuilder<_Name>;

	update<S extends AnyInputSchema>(
		name: string,
		inputSchema: S,
		run: (args: {
			ctx: MissionContext;
			input: iInferInput<S>;
			inspection: import("./contracts.d.ts").MissionInspection;
		}) => Promise<unknown> | unknown,
	): DefineBuilder<_Name>;

	schedule(
		name: string,
		options: Omit<MissionScheduleDefinition, "name">,
	): DefineBuilder<_Name>;

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

function assertNameAvailable(name: string, usedNames: Set<string>): void {
	if (usedNames.has(name)) {
		throw new MissionDefinitionError(
			`Mission definition name "${name}" is already in use.`,
		);
	}
}

function collectUsedNames(args: {
	nodes?: MissionNode[];
	queries?: MissionQueryDefinition[];
	updates?: MissionUpdateDefinition[];
	schedules?: MissionScheduleDefinition[];
}): Set<string> {
	const usedNames = new Set<string>(["start"]);
	for (const node of args.nodes ?? []) {
		if ("name" in node) {
			usedNames.add(node.name);
		}
	}
	for (const query of args.queries ?? []) {
		usedNames.add(query.name);
	}
	for (const update of args.updates ?? []) {
		usedNames.add(update.name);
	}
	for (const schedule of args.schedules ?? []) {
		usedNames.add(schedule.name);
	}
	return usedNames;
}

function assertNeedToOptions(options: NeedToOptions | undefined): void {
	if (!options?.timeout) {
		return;
	}
	if (
		!Number.isFinite(options.timeout.afterMs) ||
		options.timeout.afterMs < 0
	) {
		throw new MissionDefinitionError(
			"Signal timeout afterMs must be a finite non-negative number.",
		);
	}
	if (options.timeout.action !== "fail") {
		throw new MissionDefinitionError('Signal timeout action must be "fail".');
	}
}

function assertScheduleDefinition(
	name: string,
	options: Omit<MissionScheduleDefinition, "name">,
): void {
	const hasCron =
		typeof options.cron === "string" && options.cron.trim() !== "";
	const hasEvery =
		typeof options.every === "string" && options.every.trim() !== "";
	if (hasCron === hasEvery) {
		throw new MissionDefinitionError(
			"Schedule definitions require exactly one of cron or every.",
		);
	}
	assertNameAvailable(name, collectUsedNames({}));
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
	queries: MissionQueryDefinition[],
	updates: MissionUpdateDefinition[],
	schedules: MissionScheduleDefinition[],
): ChainBuilder<E> {
	return {
		step(eventName, run, options) {
			assertNameAvailable(
				eventName,
				collectUsedNames({ nodes, queries, updates, schedules }),
			);
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
			>(missionName, nextNodes, queries, updates, schedules);
		},

		needTo(eventName, inputSchema, options) {
			assertNameAvailable(
				eventName,
				collectUsedNames({ nodes, queries, updates, schedules }),
			);
			assertNeedToOptions(options);
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
			>(missionName, nextNodes, queries, updates, schedules);
		},

		sleep(eventName, durationMs) {
			assertDuration(durationMs);
			assertNameAvailable(
				eventName,
				collectUsedNames({ nodes, queries, updates, schedules }),
			);

			const nextNodes: MissionNode[] = [
				...nodes,
				{
					kind: "sleep",
					name: eventName,
					durationMs,
				},
			];

			return makeChainBuilder<AddEvent<E, typeof eventName, SleepEventRecord>>(
				missionName,
				nextNodes,
				queries,
				updates,
				schedules,
			);
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
						queries: queries.map(({ name }) => ({ name })),
						updates: updates.map(({ name }) => ({ name })),
						schedules: structuredClone(schedules),
					};
				},
				queries: [...queries],
				updates: [...updates],
				schedules: [...schedules],
				context: null as unknown as MissionContext<E>,
			} satisfies MissionDefinition<E>;
		},
	};
}

export const m = {
	define<Name extends string>(missionName: Name): DefineBuilder<Name> {
		const queries: MissionQueryDefinition[] = [];
		const updates: MissionUpdateDefinition[] = [];
		const schedules: MissionScheduleDefinition[] = [];

		return {
			query(name, run) {
				assertNameAvailable(
					name,
					collectUsedNames({ queries, updates, schedules }),
				);
				queries.push({ name, run });
				return this;
			},
			update(name, inputSchema, run) {
				assertNameAvailable(
					name,
					collectUsedNames({ queries, updates, schedules }),
				);
				updates.push({
					name,
					inputSchema,
					run: run as MissionUpdateDefinition["run"],
				});
				return this;
			},
			schedule(name, options) {
				assertScheduleDefinition(name, options);
				assertNameAvailable(
					name,
					collectUsedNames({ queries, updates, schedules }),
				);
				schedules.push({ name, ...options });
				return this;
			},
			start(args) {
				const startNode: StartNode = {
					kind: "start",
					inputSchema: args.input,
					run: args.run as StartNode["run"],
				};
				for (const update of updates) {
					assertNameAvailable(
						update.name,
						collectUsedNames({ nodes: [startNode] }),
					);
				}

				return makeChainBuilder<{
					start: {
						input: iInferInput<typeof args.input>;
						output: Awaited<ReturnType<typeof args.run>>;
					};
				}>(missionName, [startNode], queries, updates, schedules);
			},
		};
	},
} as const;
