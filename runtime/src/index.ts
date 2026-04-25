import { randomUUID } from "node:crypto";
import {
	type CommanderPersistenceAdapter,
	type ConfigurableCommander,
	type CreateCommanderOptions,
	createCommander,
} from "@mission-control/core";

export interface RuntimeTaskClaim {
	taskId: string;
	missionId: string;
	taskKind: string;
}

export interface ClaimRuntimeTasksOptions {
	owner: string;
	now: Date;
	leaseMs: number;
	limit: number;
}

export interface RuntimeTaskAdapter extends CommanderPersistenceAdapter {
	claimRuntimeTasks?(
		options: ClaimRuntimeTasksOptions,
	): Promise<RuntimeTaskClaim[]>;
	completeRuntimeTask?(
		taskId: string,
		owner: string,
		now?: Date,
	): Promise<void> | void;
	failRuntimeTask?(
		taskId: string,
		owner: string,
		error: unknown,
		now?: Date,
	): Promise<void> | void;
	releaseRuntimeClaims?(owner: string, now?: Date): Promise<void> | void;
}

export interface CommanderRuntimeLogEvent {
	level: "debug" | "info" | "warn" | "error";
	event:
		| "runtime-started"
		| "runtime-stopped"
		| "task-claimed"
		| "task-completed"
		| "task-failed"
		| "claims-released";
	identity: string;
	taskId?: string;
	missionId?: string;
	taskKind?: string;
	error?: unknown;
}

export interface CommanderRuntimeMetricEvent {
	name:
		| "runtime.poll"
		| "runtime.task.claimed"
		| "runtime.task.completed"
		| "runtime.task.failed"
		| "runtime.claims.released";
	value: number;
	tags: Record<string, string>;
}

export interface CreateCommanderRuntimeOptions
	extends Omit<CreateCommanderOptions, "persistence"> {
	adapter?: RuntimeTaskAdapter;
	identity?: string;
	taskQueue?: string;
	pollIntervalMs?: number;
	batchSize?: number;
	leaseTimeoutMs?: number;
	logger?: (event: CommanderRuntimeLogEvent) => void;
	metrics?: (event: CommanderRuntimeMetricEvent) => void;
}

export interface CommanderRuntime {
	readonly commander: ConfigurableCommander;
	readonly identity: string;
	readonly taskQueue: string;
	readonly pollIntervalMs: number;
	readonly batchSize: number;
	readonly leaseTimeoutMs: number;
	start(): Promise<void>;
	stop(): Promise<void>;
}

export function createCommanderRuntime(
	options: CreateCommanderRuntimeOptions = {},
): CommanderRuntime {
	const commanderOptions: CreateCommanderOptions = {};
	if (options.definitions) {
		commanderOptions.definitions = options.definitions;
	}
	if (options.clock) {
		commanderOptions.clock = options.clock;
	}
	if (options.createMissionId) {
		commanderOptions.createMissionId = options.createMissionId;
	}
	if (options.adapter) {
		commanderOptions.persistence = options.adapter;
	}

	const commander = createCommander(commanderOptions);
	const adapter = options.adapter;
	const identity = options.identity ?? `runtime-${randomUUID()}`;
	const taskQueue = options.taskQueue ?? "default";
	const pollIntervalMs = options.pollIntervalMs ?? 1000;
	const batchSize = options.batchSize ?? 10;
	const leaseTimeoutMs = options.leaseTimeoutMs ?? 30_000;
	let running = false;
	let stopping = false;
	let loop: Promise<void> | undefined;
	let sleepTimer: ReturnType<typeof setTimeout> | undefined;
	let wakeSleep: (() => void) | undefined;

	const log = (event: Omit<CommanderRuntimeLogEvent, "identity">): void => {
		options.logger?.({ ...event, identity });
	};

	const metric = (
		name: CommanderRuntimeMetricEvent["name"],
		value: number,
		tags: Record<string, string> = {},
	): void => {
		options.metrics?.({ name, value, tags: { identity, taskQueue, ...tags } });
	};

	const sleep = (ms: number): Promise<void> =>
		new Promise((resolve) => {
			wakeSleep = resolve;
			sleepTimer = setTimeout(() => {
				sleepTimer = undefined;
				wakeSleep = undefined;
				resolve();
			}, ms);
		});

	const pollOnce = async (): Promise<void> => {
		metric("runtime.poll", 1);
		const tasks =
			(await adapter?.claimRuntimeTasks?.({
				owner: identity,
				now: new Date(),
				leaseMs: leaseTimeoutMs,
				limit: batchSize,
			})) ?? [];
		for (const task of tasks) {
			log({
				level: "info",
				event: "task-claimed",
				taskId: task.taskId,
				missionId: task.missionId,
				taskKind: task.taskKind,
			});
			metric("runtime.task.claimed", 1, { taskKind: task.taskKind });
			try {
				await commander.getMission(task.missionId);
				await adapter?.completeRuntimeTask?.(task.taskId, identity, new Date());
				log({
					level: "info",
					event: "task-completed",
					taskId: task.taskId,
					missionId: task.missionId,
					taskKind: task.taskKind,
				});
				metric("runtime.task.completed", 1, { taskKind: task.taskKind });
			} catch (error) {
				await adapter?.failRuntimeTask?.(
					task.taskId,
					identity,
					error,
					new Date(),
				);
				log({
					level: "error",
					event: "task-failed",
					taskId: task.taskId,
					missionId: task.missionId,
					taskKind: task.taskKind,
					error,
				});
				metric("runtime.task.failed", 1, { taskKind: task.taskKind });
			}
		}
	};

	const runLoop = async (): Promise<void> => {
		while (running && !stopping) {
			try {
				await pollOnce();
			} catch (error) {
				log({ level: "error", event: "task-failed", error });
				metric("runtime.task.failed", 1, { taskKind: "poll" });
			}
			if (running && !stopping) {
				await sleep(pollIntervalMs);
			}
		}
	};

	const runtime: CommanderRuntime = {
		commander,
		identity,
		taskQueue,
		pollIntervalMs,
		batchSize,
		leaseTimeoutMs,
		start: async () => {
			if (running) {
				return;
			}
			await commander.waitUntilReady();
			running = true;
			stopping = false;
			log({ level: "info", event: "runtime-started" });
			loop = runLoop();
		},
		stop: async () => {
			if (!running && !loop) {
				return;
			}
			stopping = true;
			running = false;
			if (sleepTimer) {
				clearTimeout(sleepTimer);
				sleepTimer = undefined;
			}
			wakeSleep?.();
			wakeSleep = undefined;
			await loop;
			loop = undefined;
			await adapter?.releaseRuntimeClaims?.(identity, new Date());
			log({ level: "info", event: "claims-released" });
			metric("runtime.claims.released", 1);
			commander.close();
			log({ level: "info", event: "runtime-stopped" });
		},
	};

	return runtime;
}
