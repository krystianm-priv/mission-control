import { getRetryDelayMs } from "./retry-policy.js";
import { parseMissionInput } from "./schema.js";
import type {
	MissionDefinition,
	MissionNode,
	NeedToNode,
	SleepNode,
	StepNode,
} from "./types.js";
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
	persist: ((runtime: EngineRuntime) => Promise<void> | void) | undefined;
	completion: CompletionState;
}

export interface CreateEngineRuntimeOptions {
	clock?: EngineClock;
	persist?: (runtime: EngineRuntime) => Promise<void> | void;
}

function createCompletionState(): CompletionState {
	let resolveRef!: (snapshot: MissionSnapshot) => void;
	let rejectRef!: (error: unknown) => void;
	const promise = new Promise<MissionSnapshot>((resolve, reject) => {
		resolveRef = resolve;
		rejectRef = reject;
	});
	void promise.catch(() => {});
	return { promise, resolve: resolveRef, reject: rejectRef, settled: false };
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

	return { message: String(error) };
}

function appendHistory(runtime: EngineRuntime, record: MissionHistoryRecord): void {
	runtime.history.push(record);
}

async function persistRuntime(runtime: EngineRuntime): Promise<void> {
	await runtime.persist?.(runtime);
}

function settleCompletion(runtime: EngineRuntime): void {
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

async function setFailure(runtime: EngineRuntime, error: unknown): Promise<void> {
	runtime.snapshot.status = "failed";
	runtime.snapshot.error = toErrorShape(error);
	runtime.snapshot.waiting = undefined;
	appendHistory(runtime, {
		type: "mission-failed",
		at: runtime.clock.now().toISOString(),
		details: { message: runtime.snapshot.error?.message ?? "Unknown mission failure." },
	});
	await persistRuntime(runtime);
	settleCompletion(runtime);
}

function getLatestScheduledTimer(
	runtime: EngineRuntime,
	eventName: string,
	kind: TimerRecord["kind"],
): TimerRecord | undefined {
	return [...runtime.timers]
		.reverse()
		.find((timer) => timer.eventName === eventName && timer.kind === kind && timer.status === "scheduled");
}

async function scheduleStoredWakeup(
	runtime: EngineRuntime,
	args: {
		kind: "timer" | "retry";
		eventName: string;
		nodeIndex: number;
		dueAt: string;
		onWake: () => Promise<void>;
	},
): Promise<void> {
	const dueAtMs = new Date(args.dueAt).getTime();
	const delayMs = Math.max(0, dueAtMs - runtime.clock.now().getTime());
	const token = Symbol(`${args.kind}:${args.eventName}`);
	runtime.scheduledToken = token;

	void runtime.clock.sleep(delayMs).then(async () => {
		if (runtime.scheduledToken !== token) {
			return;
		}

		const timer = getLatestScheduledTimer(
			runtime,
			args.eventName,
			args.kind === "retry" ? "retry" : "sleep",
		);
		if (timer) {
			timer.status = "completed";
			timer.resumedAt = runtime.clock.now().toISOString();
		}
		if (args.kind === "timer") {
			runtime.snapshot.ctx.events[args.eventName] = {
				output: {
					scheduledAt: timer?.scheduledAt ?? runtime.clock.now().toISOString(),
					dueAt: timer?.dueAt ?? args.dueAt,
					resumedAt: timer?.resumedAt ?? runtime.clock.now().toISOString(),
				},
			};
		}
		appendHistory(runtime, {
			type: "timer-fired",
			at: timer?.resumedAt ?? runtime.clock.now().toISOString(),
			eventName: args.eventName,
		});
		runtime.snapshot.waiting = undefined;
		await persistRuntime(runtime);
		await args.onWake();
	});
}

async function scheduleTimerWait(
	runtime: EngineRuntime,
	node: SleepNode,
	nodeIndex: number,
): Promise<void> {
	const scheduledAt = runtime.clock.now().toISOString();
	const dueAt = new Date(runtime.clock.now().getTime() + node.durationMs).toISOString();
	runtime.timers.push({
		eventName: node.name,
		kind: "sleep",
		scheduledAt,
		dueAt,
		status: "scheduled",
	});
	runtime.snapshot.ctx.events[node.name] = { output: { scheduledAt, dueAt } };
	runtime.snapshot.status = "waiting";
	runtime.snapshot.waiting = {
		kind: "timer",
		eventName: node.name,
		nodeIndex,
		timerDueAt: dueAt,
	};
	appendHistory(runtime, {
		type: "timer-scheduled",
		at: scheduledAt,
		eventName: node.name,
		details: { dueAt, kind: "sleep" },
	});
	await persistRuntime(runtime);
	await scheduleStoredWakeup(runtime, {
		kind: "timer",
		eventName: node.name,
		nodeIndex,
		dueAt,
		onWake: async () => {
			runtime.snapshot.cursor = nodeIndex + 1;
			await runUntilWaitOrEnd(runtime);
		},
	});
}

async function scheduleRetryWait(
	runtime: EngineRuntime,
	node: StepNode,
	nodeIndex: number,
	attemptNumber: number,
	delayMs: number,
): Promise<void> {
	if (delayMs <= 0) {
		await executeStep(runtime, node);
		return;
	}

	const scheduledAt = runtime.clock.now().toISOString();
	const dueAt = new Date(runtime.clock.now().getTime() + delayMs).toISOString();
	runtime.timers.push({
		eventName: node.name,
		kind: "retry",
		scheduledAt,
		dueAt,
		status: "scheduled",
	});
	runtime.snapshot.status = "waiting";
	runtime.snapshot.waiting = {
		kind: "retry",
		eventName: node.name,
		nodeIndex,
		timerDueAt: dueAt,
	};
	appendHistory(runtime, {
		type: "step-retry-scheduled",
		at: scheduledAt,
		eventName: node.name,
		attemptNumber,
		details: { delayMs, dueAt },
	});
	await persistRuntime(runtime);
	await scheduleStoredWakeup(runtime, {
		kind: "retry",
		eventName: node.name,
		nodeIndex,
		dueAt,
		onWake: async () => {
			try {
				await executeStep(runtime, node);
				await runUntilWaitOrEnd(runtime);
			} catch (error) {
				await setFailure(runtime, error);
			}
		},
	});
}

async function scheduleNeedToTimeout(
	runtime: EngineRuntime,
	node: NeedToNode,
): Promise<void> {
	if (!node.timeout || node.timeout.action !== "fail") {
		return;
	}

	const dueAt = new Date(runtime.clock.now().getTime() + node.timeout.afterMs).toISOString();
	runtime.snapshot.waiting = {
		kind: "signal",
		eventName: node.name,
		nodeIndex: runtime.snapshot.cursor,
		timeoutAt: dueAt,
	};
	await persistRuntime(runtime);

	const token = Symbol(`${node.name}:timeout`);
	runtime.scheduledToken = token;
	void runtime.clock.sleep(Math.max(0, new Date(dueAt).getTime() - runtime.clock.now().getTime())).then(async () => {
		if (runtime.scheduledToken !== token) {
			return;
		}
		await setFailure(
			runtime,
			new MissionSignalError(
				node.timeout?.errorMessage ?? `Timed out waiting for signal "${node.name}".`,
			),
		);
	});
}

async function executeStep(runtime: EngineRuntime, node: StepNode): Promise<void> {
	const nextAttemptNumber =
		runtime.stepAttempts.filter((attempt) => attempt.stepName === node.name).length + 1;
	const attempt: StepAttemptRecord = {
		stepName: node.name,
		attemptNumber: nextAttemptNumber,
		startedAt: runtime.clock.now().toISOString(),
		status: "running",
	};
	runtime.stepAttempts.push(attempt);
	await persistRuntime(runtime);

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
		await persistRuntime(runtime);
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
		await persistRuntime(runtime);

		if (nextAttemptNumber < node.retryPolicy.maxAttempts) {
			const delayMs = getRetryDelayMs(node.retryPolicy, nextAttemptNumber + 1);
			await scheduleRetryWait(
				runtime,
				node,
				runtime.snapshot.cursor,
				nextAttemptNumber + 1,
				delayMs,
			);
			return;
		}

		throw error;
	}
}

export async function runUntilWaitOrEnd(runtime: EngineRuntime): Promise<void> {
	const nodes = runtime.definition.nodes as MissionNode[];
	runtime.snapshot.status = "running";
	await persistRuntime(runtime);

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
			await persistRuntime(runtime);
			settleCompletion(runtime);
			return;
		}

		if (node.kind === "start") {
			runtime.snapshot.cursor += 1;
			await persistRuntime(runtime);
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
			await persistRuntime(runtime);
			await scheduleNeedToTimeout(runtime, node);
			return;
		}

		if (node.kind === "sleep") {
			await scheduleTimerWait(runtime, node, runtime.snapshot.cursor);
			return;
		}

		await executeStep(runtime, node);
		if (runtime.snapshot.waiting) {
			return;
		}
	}

	runtime.snapshot.status = "completed";
	await persistRuntime(runtime);
	settleCompletion(runtime);
}

export function createEngineRuntime(
	definition: MissionDefinition<any>,
	missionId: string,
	options: CreateEngineRuntimeOptions = {},
): EngineRuntime {
	return {
		snapshot: {
			missionId,
			missionName: definition.missionName,
			status: "idle",
			cursor: 0,
			error: undefined,
			ctx: { missionId, events: {} },
			waiting: undefined,
		},
		history: [
			{
				type: "mission-created",
				at: (options.clock ?? realClock).now().toISOString(),
			},
		],
		stepAttempts: [],
		signals: [],
		timers: [],
		definition,
		clock: options.clock ?? realClock,
		activeSignalToken: undefined,
		scheduledToken: undefined,
		persist: options.persist,
		completion: createCompletionState(),
	};
}

export function hydrateEngineRuntime(
	definition: MissionDefinition<any>,
	inspection: MissionInspection,
	options: CreateEngineRuntimeOptions = {},
): EngineRuntime {
	const runtime: EngineRuntime = {
		snapshot: structuredClone(inspection.snapshot),
		history: structuredClone(inspection.history),
		stepAttempts: structuredClone(inspection.stepAttempts),
		signals: structuredClone(inspection.signals),
		timers: structuredClone(inspection.timers),
		definition,
		clock: options.clock ?? realClock,
		activeSignalToken: undefined,
		scheduledToken: undefined,
		persist: options.persist,
		completion: createCompletionState(),
	};

	settleCompletion(runtime);
	return runtime;
}

export async function recoverRuntime(runtime: EngineRuntime): Promise<void> {
	const waiting = runtime.snapshot.waiting;
	if (!waiting) {
		settleCompletion(runtime);
		return;
	}

	if (waiting.kind === "signal") {
		const timeoutAt = waiting.timeoutAt;
		if (!timeoutAt) {
			return;
		}
		const node = runtime.definition.nodes[waiting.nodeIndex];
		if (!node || node.kind !== "needTo") {
			throw new MissionExecutionError("Mission waiting state is out of sync.");
		}
		await scheduleNeedToTimeout(runtime, node);
		return;
	}

	if (!waiting.timerDueAt) {
		return;
	}

	const node = runtime.definition.nodes[waiting.nodeIndex];
	if (waiting.kind === "timer") {
		if (!node || node.kind !== "sleep") {
			throw new MissionExecutionError("Timer waiting state is out of sync.");
		}
		await scheduleStoredWakeup(runtime, {
			kind: "timer",
			eventName: waiting.eventName,
			nodeIndex: waiting.nodeIndex,
			dueAt: waiting.timerDueAt,
			onWake: async () => {
				runtime.snapshot.cursor = waiting.nodeIndex + 1;
				await runUntilWaitOrEnd(runtime);
			},
		});
		return;
	}

	if (!node || node.kind !== "step") {
		throw new MissionExecutionError("Retry waiting state is out of sync.");
	}
	await scheduleStoredWakeup(runtime, {
		kind: "retry",
		eventName: waiting.eventName,
		nodeIndex: waiting.nodeIndex,
		dueAt: waiting.timerDueAt,
		onWake: async () => {
			try {
				await executeStep(runtime, node);
				await runUntilWaitOrEnd(runtime);
			} catch (error) {
				await setFailure(runtime, error);
			}
		},
	});
}

export async function startRuntime(runtime: EngineRuntime, input: unknown): Promise<void> {
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
		runtime.snapshot.ctx.events.start = {
			input: parseMissionInput("start", startNode.inputSchema, input),
		};
		appendHistory(runtime, {
			type: "mission-started",
			at: runtime.clock.now().toISOString(),
		});
		await persistRuntime(runtime);
		runtime.snapshot.ctx.events.start.output = await startNode.run({
			ctx: runtime.snapshot.ctx,
		});
		runtime.snapshot.cursor = 1;
		await persistRuntime(runtime);
		await runUntilWaitOrEnd(runtime);
	} catch (error) {
		await setFailure(runtime, error);
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
		await persistRuntime(runtime);
		await runUntilWaitOrEnd(runtime);
	} catch (error) {
		await setFailure(runtime, error);
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
