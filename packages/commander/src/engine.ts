import {
	getRetryDelayMs,
	parseMissionInput,
	type MissionDefinition,
	type MissionNode,
	type NeedToNode,
	type SleepNode,
	type StepNode,
} from "@mission-control/core";

import type {
	MissionHistoryRecord,
	MissionInspection,
	MissionSnapshot,
	SignalRecord,
	StepAttemptRecord,
	TimerRecord,
} from "./contracts.js";
import {
	MissionAlreadyStartedError,
	MissionExecutionError,
	MissionSignalError,
} from "./errors.js";

export interface EngineClock {
	now(): Date;
	sleep(ms: number): Promise<void>;
}

export const realClock: EngineClock = {
	now: () => new Date(),
	sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

interface CompletionState {
	promise: Promise<MissionSnapshot>;
	resolve: (snapshot: MissionSnapshot) => void;
	reject: (error: unknown) => void;
	settled: boolean;
}

export interface EngineRuntime {
	snapshot: MissionSnapshot;
	history: MissionHistoryRecord[];
	stepAttempts: StepAttemptRecord[];
	signals: SignalRecord[];
	timers: TimerRecord[];
	definition: MissionDefinition<any>;
	clock: EngineClock;
	activeSignalToken: symbol | undefined;
	scheduledToken: symbol | undefined;
	completion: CompletionState;
}

function toErrorShape(error: unknown) {
	if (error instanceof Error) {
		const shaped: { message: string; code?: string; stack?: string } = {
			message: error.message,
		};
		if ("code" in error && typeof error.code === "string") {
			shaped.code = error.code;
		}
		if (typeof error.stack === "string") {
			shaped.stack = error.stack;
		}
		return shaped;
	}

	return {
		message: String(error),
	};
}

function createCompletionState(): CompletionState {
	let resolveRef!: (snapshot: MissionSnapshot) => void;
	let rejectRef!: (error: unknown) => void;
	const promise = new Promise<MissionSnapshot>((resolve, reject) => {
		resolveRef = resolve;
		rejectRef = reject;
	});
	void promise.catch(() => {});

	return {
		promise,
		resolve: resolveRef,
		reject: rejectRef,
		settled: false,
	};
}

function appendHistory(
	runtime: EngineRuntime,
	record: MissionHistoryRecord,
): void {
	runtime.history.push(record);
}

function settleCompletion(runtime: EngineRuntime) {
	if (runtime.completion.settled) {
		return;
	}

	if (runtime.snapshot.status === "completed") {
		runtime.completion.settled = true;
		runtime.completion.resolve(runtime.snapshot);
		return;
	}

	if (runtime.snapshot.status === "failed") {
		runtime.completion.settled = true;
		runtime.completion.reject(runtime.snapshot.error);
	}
}

function setFailure(runtime: EngineRuntime, error: unknown) {
	runtime.snapshot.status = "failed";
	runtime.snapshot.error = toErrorShape(error);
	runtime.snapshot.waiting = undefined;
	const errorMessage = runtime.snapshot.error?.message ?? "Unknown mission failure.";
	appendHistory(runtime, {
		type: "mission-failed",
		at: runtime.clock.now().toISOString(),
		details: { message: errorMessage },
	});
	settleCompletion(runtime);
}

async function scheduleTimer(
	runtime: EngineRuntime,
	node: SleepNode,
	nodeIndex: number,
) {
	const scheduledAt = runtime.clock.now();
	const dueAt = new Date(scheduledAt.getTime() + node.durationMs);
	const timer: TimerRecord = {
		eventName: node.name,
		scheduledAt: scheduledAt.toISOString(),
		dueAt: dueAt.toISOString(),
		status: "scheduled",
	};
	runtime.timers.push(timer);
	runtime.snapshot.ctx.events[node.name] = {
		output: {
			scheduledAt: timer.scheduledAt,
			dueAt: timer.dueAt,
		},
	};
	runtime.snapshot.status = "waiting";
	runtime.snapshot.waiting = {
		kind: "timer",
		eventName: node.name,
		nodeIndex,
		timerDueAt: timer.dueAt,
	};
	appendHistory(runtime, {
		type: "timer-scheduled",
		at: scheduledAt.toISOString(),
		eventName: node.name,
		details: { dueAt: timer.dueAt },
	});

	const token = Symbol(node.name);
	runtime.scheduledToken = token;

	void runtime.clock.sleep(node.durationMs).then(async () => {
		if (runtime.scheduledToken !== token) {
			timer.status = "cancelled";
			return;
		}

		timer.status = "completed";
		timer.resumedAt = runtime.clock.now().toISOString();
		runtime.snapshot.ctx.events[node.name] = {
			output: {
				scheduledAt: timer.scheduledAt,
				dueAt: timer.dueAt,
				resumedAt: timer.resumedAt,
			},
		};
		appendHistory(runtime, {
			type: "timer-fired",
			at: timer.resumedAt,
			eventName: node.name,
		});
		runtime.snapshot.waiting = undefined;
		runtime.snapshot.cursor = nodeIndex + 1;
		await runUntilWaitOrEnd(runtime);
	});
}

function scheduleNeedToTimeout(runtime: EngineRuntime, node: NeedToNode) {
	if (!node.timeout || node.timeout.action !== "fail") {
		return;
	}

	const dueAt = new Date(runtime.clock.now().getTime() + node.timeout.afterMs);
	runtime.snapshot.waiting = {
		kind: "signal",
		eventName: node.name,
		nodeIndex: runtime.snapshot.cursor,
		timeoutAt: dueAt.toISOString(),
	};

	const token = Symbol(`${node.name}-timeout`);
	runtime.scheduledToken = token;
	void runtime.clock.sleep(node.timeout.afterMs).then(() => {
		if (runtime.scheduledToken !== token) {
			return;
		}
		setFailure(
			runtime,
			new MissionSignalError(
				node.timeout?.errorMessage ??
					`Timed out waiting for signal "${node.name}".`,
			),
		);
	});
}

async function executeStep(
	runtime: EngineRuntime,
	node: StepNode,
): Promise<void> {
	const nextAttemptNumber =
		runtime.stepAttempts.filter((attempt) => attempt.stepName === node.name).length +
		1;
	const startedAt = runtime.clock.now().toISOString();
	const attempt: StepAttemptRecord = {
		stepName: node.name,
		attemptNumber: nextAttemptNumber,
		startedAt,
		status: "running",
	};
	runtime.stepAttempts.push(attempt);

	try {
		const output = await node.run({ ctx: runtime.snapshot.ctx });
		attempt.status = "succeeded";
		attempt.finishedAt = runtime.clock.now().toISOString();
		runtime.snapshot.ctx.events[node.name] = { output };
		appendHistory(runtime, {
			type: "step-succeeded",
			at: attempt.finishedAt,
			eventName: node.name,
			attemptNumber: nextAttemptNumber,
		});
		runtime.snapshot.cursor += 1;
	} catch (error) {
		attempt.status = "failed";
		attempt.finishedAt = runtime.clock.now().toISOString();
		attempt.error = error instanceof Error ? error.message : String(error);
		appendHistory(runtime, {
			type: "step-failed",
			at: attempt.finishedAt,
			eventName: node.name,
			attemptNumber: nextAttemptNumber,
			details: { message: attempt.error },
		});

		if (nextAttemptNumber < node.retryPolicy.maxAttempts) {
			const delayMs = getRetryDelayMs(node.retryPolicy, nextAttemptNumber + 1);
			appendHistory(runtime, {
				type: "step-retry-scheduled",
				at: runtime.clock.now().toISOString(),
				eventName: node.name,
				attemptNumber: nextAttemptNumber + 1,
				details: { delayMs },
			});
			if (delayMs > 0) {
				await runtime.clock.sleep(delayMs);
			}
			return executeStep(runtime, node);
		}

		throw error;
	}
}

export async function runUntilWaitOrEnd(runtime: EngineRuntime): Promise<void> {
	const nodes = runtime.definition.nodes as MissionNode[];
	runtime.snapshot.status = "running";

	while (runtime.snapshot.cursor < nodes.length) {
		const node = nodes[runtime.snapshot.cursor];
		if (!node) {
			throw new MissionExecutionError("Missing mission node.");
		}

		if (node.kind === "end") {
			runtime.snapshot.status = "completed";
			appendHistory(runtime, {
				type: "mission-completed",
				at: runtime.clock.now().toISOString(),
			});
			settleCompletion(runtime);
			return;
		}

		if (node.kind === "start") {
			runtime.snapshot.cursor += 1;
			continue;
		}

		if (node.kind === "needTo") {
			runtime.snapshot.status = "waiting";
			runtime.snapshot.waiting = {
				kind: "signal",
				eventName: node.name,
				nodeIndex: runtime.snapshot.cursor,
			};
			appendHistory(runtime, {
				type: "waiting-for-signal",
				at: runtime.clock.now().toISOString(),
				eventName: node.name,
			});
			scheduleNeedToTimeout(runtime, node);
			return;
		}

		if (node.kind === "sleep") {
			await scheduleTimer(runtime, node, runtime.snapshot.cursor);
			return;
		}

		await executeStep(runtime, node);
	}

	runtime.snapshot.status = "completed";
	settleCompletion(runtime);
}

export function createEngineRuntime(
	definition: MissionDefinition<any>,
	missionId: string,
	clock: EngineClock = realClock,
): EngineRuntime {
	const snapshot: MissionSnapshot = {
		missionId,
		missionName: definition.missionName,
		status: "idle",
		cursor: 0,
		error: undefined,
		ctx: {
			missionId,
			events: {},
		},
		waiting: undefined,
	};

	const runtime: EngineRuntime = {
		snapshot,
		history: [],
		stepAttempts: [],
		signals: [],
		timers: [],
		definition,
		clock,
		activeSignalToken: undefined,
		scheduledToken: undefined,
		completion: createCompletionState(),
	};

	appendHistory(runtime, {
		type: "mission-created",
		at: clock.now().toISOString(),
	});

	return runtime;
}

export async function startRuntime(
	runtime: EngineRuntime,
	input: unknown,
): Promise<void> {
	if (runtime.snapshot.status !== "idle") {
		throw new MissionAlreadyStartedError(runtime.snapshot.status);
	}

	const startNode = runtime.definition.nodes.find(
		(node): node is Extract<MissionNode, { kind: "start" }> => node.kind === "start",
	);

	if (!startNode) {
		throw new MissionExecutionError("Mission has no start node.");
	}

	try {
		const parsedInput = parseMissionInput("start", startNode.inputSchema, input);
		runtime.snapshot.ctx.events.start = { input: parsedInput };
		appendHistory(runtime, {
			type: "mission-started",
			at: runtime.clock.now().toISOString(),
		});
		const output = await startNode.run({ ctx: runtime.snapshot.ctx });
		runtime.snapshot.ctx.events.start.output = output;
		runtime.snapshot.cursor = 1;
		await runUntilWaitOrEnd(runtime);
	} catch (error) {
		setFailure(runtime, error);
		throw error;
	}
}

export async function signalRuntime(
	runtime: EngineRuntime,
	eventName: string,
	input: unknown,
): Promise<void> {
	if (runtime.snapshot.status !== "waiting" || !runtime.snapshot.waiting) {
		throw new MissionSignalError(
			`Mission is not waiting for a signal (status=${runtime.snapshot.status}).`,
		);
	}

	const waiting = runtime.snapshot.waiting;
	if (waiting.kind !== "signal" || waiting.eventName !== eventName) {
		throw new MissionSignalError(
			`Mission is waiting for "${waiting.eventName}", not "${eventName}".`,
		);
	}

	if (runtime.activeSignalToken) {
		throw new MissionSignalError(`Signal "${eventName}" is already being applied.`);
	}

	const node = runtime.definition.nodes[waiting.nodeIndex];
	if (!node || node.kind !== "needTo") {
		throw new MissionExecutionError("Mission waiting state is out of sync.");
	}

	const token = Symbol(eventName);
	runtime.activeSignalToken = token;
	runtime.scheduledToken = undefined;

	try {
		const parsedInput = parseMissionInput(eventName, node.inputSchema, input);
		runtime.snapshot.ctx.events[eventName] = { input: parsedInput };
		runtime.snapshot.waiting = undefined;
		runtime.signals.push({
			eventName,
			receivedAt: runtime.clock.now().toISOString(),
			payload: parsedInput,
		});
		appendHistory(runtime, {
			type: "signal-received",
			at: runtime.clock.now().toISOString(),
			eventName,
		});
		runtime.snapshot.cursor = waiting.nodeIndex + 1;
		await runUntilWaitOrEnd(runtime);
	} catch (error) {
		setFailure(runtime, error);
		throw error;
	} finally {
		if (runtime.activeSignalToken === token) {
			runtime.activeSignalToken = undefined;
		}
	}
}

export function inspectRuntime(runtime: EngineRuntime): MissionInspection {
	return {
		snapshot: structuredClone(runtime.snapshot),
		history: structuredClone(runtime.history),
		stepAttempts: structuredClone(runtime.stepAttempts),
		signals: structuredClone(runtime.signals),
		timers: structuredClone(runtime.timers),
	};
}

export function waitForCompletion(runtime: EngineRuntime): Promise<MissionSnapshot> {
	return runtime.completion.promise.then((snapshot) => structuredClone(snapshot));
}
