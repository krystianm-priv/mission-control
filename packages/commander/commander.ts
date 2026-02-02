import type { MissionDefinition } from "@mission-control/core";

/** Minimal runtime node shape based on core nodes. */
type AnyNode =
	| {
			kind: "start";
			inputSchema: unknown;
			run: (args: { ctx: any }) => Promise<any>;
	  }
	| { kind: "step"; name: string; run: (args: { ctx: any }) => Promise<any> }
	| { kind: "needTo"; name: string; inputSchema: unknown }
	| { kind: "end" };

type MissionStatus = "idle" | "running" | "waiting" | "completed" | "failed";

type MissionRuntime = {
	missionId: string;
	missionName: string;
	status: MissionStatus;
	error?: unknown;

	/** Index of the node we are currently at / last processed. */
	cursor: number;

	/** If waiting, which event name we are waiting for + schema + node index. */
	waitingFor?: {
		name: string;
		inputSchema: unknown;
		nodeIndex: number;
	};

	/** Runtime context. */
	ctx: {
		missionId: string;
		events: Record<string, any>;
	};
};

/** Detect and validate only Zod for now; everything else passes through. */
function validateWithSchema(_schema: unknown, input: unknown) {
	// Validation is intentionally disabled in this example.
	return input;
}

function genId(prefix = "mission") {
	// crypto.randomUUID in modern runtimes; fallback otherwise
	const uuid =
		typeof crypto !== "undefined" && "randomUUID" in crypto
			? (crypto as any).randomUUID()
			: Math.random().toString(16).slice(2) + Date.now().toString(16);
	return `${prefix}-${uuid}`;
}

type ExternalEventNames<M extends MissionDefinition<any>> = {
	[K in keyof M["context"]["events"]]: M["context"]["events"][K] extends {
		input: any;
	}
		? M["context"]["events"][K] extends { output: any }
			? never
			: K
		: never;
}[keyof M["context"]["events"]];

export type InMemoryMissionInstance<M extends MissionDefinition<any>> = {
	missionId: string;
	missionName: M["missionName"];

	get status(): MissionStatus;
	get error(): unknown;

	/** Read-only runtime context view. */
	get ctx(): MissionRuntime["ctx"];

	startMission(input: M["context"]["events"]["start"]["input"]): Promise<void>;

	/** Resume when the mission is waiting on a specific needTo event. */
	signal<E extends ExternalEventNames<M>>(
		eventName: E,
		input: M["context"]["events"][E]["input"],
	): Promise<void>;
};

export const inMemoryCommander = (() => {
	const missionDefs: Record<string, MissionDefinition<any>> = {};
	const missions: Record<string, MissionRuntime> = {};
	const instances: Record<string, any> = {};

	async function runUntilWaitOrEnd(
		def: MissionDefinition<any>,
		runtime: MissionRuntime,
	) {
		const nodes = def.nodes as AnyNode[];

		while (runtime.cursor < nodes.length) {
			const node = nodes[runtime.cursor];

			if (node.kind === "end") {
				runtime.status = "completed";
				return;
			}

			// Start node is only executed via startMission().
			if (node.kind === "start") {
				runtime.cursor += 1;
				continue;
			}

			if (node.kind === "needTo") {
				runtime.status = "waiting";
				runtime.waitingFor = {
					name: node.name,
					inputSchema: node.inputSchema,
					nodeIndex: runtime.cursor,
				};
				return;
			}

			if (node.kind === "step") {
				try {
					runtime.status = "running";
					console.log('Running step node:', node.name);
					const out = await node.run({ ctx: runtime.ctx });

					// Steps emit OUTPUT.
					runtime.ctx.events[node.name] = {
						output: out,
					};

					runtime.cursor += 1;
					continue;
				} catch (err) {
					runtime.status = "failed";
					runtime.error = err;
					return;
				}
			}

			// Unknown node type.
			runtime.status = "failed";
			runtime.error = new Error(`Unknown node at index ${runtime.cursor}`);
			return;
		}

		// Fell off the end without an explicit end node.
		runtime.status = "completed";
	}

	return {
		missions,
		missionDefs,

		createMission<M extends MissionDefinition<any>>(
			mission: M,
		): InMemoryMissionInstance<M> {
			const missionId = genId();

			if (!missionDefs[mission.missionName]) {
				missionDefs[mission.missionName] = mission;
			}

			const runtime: MissionRuntime = {
				missionId,
				missionName: mission.missionName,
				status: "idle",
				cursor: 0,
				ctx: {
					missionId,
					events: {},
				},
			};

			missions[missionId] = runtime;

			const instance: InMemoryMissionInstance<M> = {
				missionId,
				missionName: mission.missionName as M["missionName"],

				get status() {
					return runtime.status;
				},
				get error() {
					return runtime.error;
				},
				get ctx() {
					return runtime.ctx;
				},

				async startMission(input) {
					if (runtime.status !== "idle") {
						throw new Error(
							`Mission already started (status=${runtime.status})`,
						);
					}

					const nodes = mission.nodes as AnyNode[];
					const startIndex = nodes.findIndex((n) => n.kind === "start");
					if (startIndex === -1) throw new Error("Mission has no start node");

					const startNode = nodes[startIndex] as Extract<
						AnyNode,
						{ kind: "start" }
					>;

					// Validate start input (Zod if available).
					const parsedInput = validateWithSchema(startNode.inputSchema, input);

					// Populate start event input.
					runtime.ctx.events.start = { input: parsedInput };

					runtime.status = "running";
					runtime.cursor = startIndex;

					try {
						const startOutput = await startNode.run({ ctx: runtime.ctx });

						// Start emits OUTPUT.
						runtime.ctx.events.start.output = startOutput;

						// Proceed to the next node after start.
						runtime.cursor = startIndex + 1;
						await runUntilWaitOrEnd(mission, runtime);
					} catch (err) {
						runtime.status = "failed";
						runtime.error = err;
						throw err;
					}
				},

				async signal(eventName, input) {
					if (runtime.status !== "waiting" || !runtime.waitingFor) {
						throw new Error(
							`Mission is not waiting (status=${runtime.status})`,
						);
					}
					if (runtime.waitingFor.name !== eventName) {
						throw new Error(
							`Mission is waiting for "${runtime.waitingFor.name}", not "${String(
								eventName,
							)}"`,
						);
					}

					// Validate needTo input (Zod if available).
					const parsedInput = validateWithSchema(
						runtime.waitingFor.inputSchema,
						input,
					);

					// needTo emits INPUT.
					runtime.ctx.events[String(eventName)] = { input: parsedInput };

					// Resume after the needTo node.
					const resumeFrom = runtime.waitingFor.nodeIndex + 1;
					runtime.waitingFor = undefined;
					runtime.cursor = resumeFrom;

					console.log(
						'Signaled event',
						eventName,
						'with input:',
						input,
						parsedInput,
					);

					await runUntilWaitOrEnd(mission, runtime);
				},
			};

			instances[missionId] = instance;
			return instance;
		},

		getMissionInstanceById<M extends MissionDefinition<any>>(
			missionId: string,
		): InMemoryMissionInstance<M> | undefined {
			return instances[missionId];
		},
	};
})();
