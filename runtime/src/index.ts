import { randomUUID } from "node:crypto";
import {
	type CommanderPersistenceAdapter,
	type ConfigurableCommander,
	type CreateCommanderOptions,
	createCommander,
} from "@mission-control/core";

export interface RuntimeStartAtEntry {
	missionId: string;
	startAt: string;
}

export interface RuntimeTickAdapter extends CommanderPersistenceAdapter {
	listIncompleteMissionIds?(now?: Date): Promise<string[]> | string[];
	listStartAtEntries?(
		now?: Date,
	): Promise<RuntimeStartAtEntry[]> | RuntimeStartAtEntry[];
}

export interface CommanderRuntimeLogEvent {
	level: "debug" | "info" | "warn" | "error";
	event:
		| "runtime-started"
		| "runtime-stopped"
		| "tick-started"
		| "tick-completed"
		| "tick-failed"
		| "tick-skipped"
		| "tick-scheduled"
		| "mission-resume-started"
		| "mission-resume-failed";
	identity: string;
	missionId?: string;
	error?: unknown;
	at?: string;
}

export interface CommanderRuntimeMetricEvent {
	name:
		| "runtime.tick"
		| "runtime.tick.skipped"
		| "runtime.tick.failed"
		| "runtime.tick.empty"
		| "runtime.mission.resume.started"
		| "runtime.mission.resume.failed";
	value: number;
	tags: Record<string, string>;
}

export interface CreateCommanderRuntimeOptions
	extends Omit<CreateCommanderOptions, "persistence"> {
	adapter?: RuntimeTickAdapter;
	identity?: string;
	logger?: (event: CommanderRuntimeLogEvent) => void;
	metrics?: (event: CommanderRuntimeMetricEvent) => void;
}

export interface CommanderRuntime {
	readonly commander: ConfigurableCommander;
	readonly identity: string;
	isTickRunning(): boolean;
	start(): Promise<void>;
	stop(): Promise<void>;
	tick(): Promise<boolean>;
	setNextTickAt(at: Date): void;
	setNextTickIn(ms: number): void;
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
	let running = false;
	let stopping = false;
	let tickInFlight: Promise<boolean> | undefined;
	let nextTickTimer: ReturnType<typeof setTimeout> | undefined;

	const log = (event: Omit<CommanderRuntimeLogEvent, "identity">): void => {
		options.logger?.({ ...event, identity });
	};

	const metric = (
		name: CommanderRuntimeMetricEvent["name"],
		value: number,
		tags: Record<string, string> = {},
	): void => {
		options.metrics?.({ name, value, tags: { identity, ...tags } });
	};

	const clearNextTickTimer = (): void => {
		if (!nextTickTimer) {
			return;
		}
		clearTimeout(nextTickTimer);
		nextTickTimer = undefined;
	};

	const setNextTickAt = (at: Date): void => {
		clearNextTickTimer();
		const delayMs = Math.max(0, at.getTime() - Date.now());
		log({
			level: "debug",
			event: "tick-scheduled",
			at: at.toISOString(),
		});
		nextTickTimer = setTimeout(() => {
			nextTickTimer = undefined;
			void runtime.tick();
		}, delayMs);
	};

	const setNextTickIn = (ms: number): void => {
		setNextTickAt(new Date(Date.now() + Math.max(0, ms)));
	};

	const collectIncompleteMissionIds = async (): Promise<string[]> => {
		const now = new Date();
		if (adapter?.listIncompleteMissionIds) {
			const ids = await adapter.listIncompleteMissionIds(now);
			return [...new Set(ids)];
		}
		const inspections = await adapter?.listRecoverableInspections?.();
		if (!inspections) {
			return [];
		}
		return [
			...new Set(
				inspections.map((inspection) => inspection.snapshot.missionId),
			),
		];
	};

	const scheduleStartupStartAtTicks = async (): Promise<void> => {
		const entries: RuntimeStartAtEntry[] = [];
		if (adapter?.listStartAtEntries) {
			entries.push(...(await adapter.listStartAtEntries(new Date())));
		} else {
			const scheduled = await adapter?.listScheduledSnapshots?.();
			for (const snapshot of scheduled ?? []) {
				if (
					snapshot.waiting.eventName.startsWith("start_at") &&
					snapshot.waiting.timerDueAt
				) {
					entries.push({
						missionId: snapshot.missionId,
						startAt: snapshot.waiting.timerDueAt,
					});
				}
			}
		}

		if (entries.length === 0) {
			return;
		}

		// The runtime keeps one next-tick timer and executes ticks serially.
		const earliest = entries
			.map((entry) => new Date(entry.startAt))
			.filter((date) => Number.isFinite(date.getTime()))
			.sort((left, right) => left.getTime() - right.getTime())[0];
		if (!earliest) {
			return;
		}
		setNextTickAt(earliest);
	};

	const tick = async (): Promise<boolean> => {
		if (!running || stopping) {
			return false;
		}
		if (tickInFlight) {
			log({ level: "debug", event: "tick-skipped" });
			metric("runtime.tick.skipped", 1);
			return false;
		}

		tickInFlight = (async () => {
			try {
				log({ level: "info", event: "tick-started" });
				metric("runtime.tick", 1);
				const missionIds = await collectIncompleteMissionIds();
				if (missionIds.length === 0) {
					metric("runtime.tick.empty", 1);
					log({ level: "debug", event: "tick-completed" });
					return true;
				}

				for (const missionId of missionIds) {
					try {
						const mission = await commander.getMission(missionId);
						if (!mission) {
							continue;
						}
						log({
							level: "info",
							event: "mission-resume-started",
							missionId,
						});
						metric("runtime.mission.resume.started", 1, { missionId });
						void mission.waitForCompletion().catch((error: unknown) => {
							log({
								level: "error",
								event: "mission-resume-failed",
								missionId,
								error,
							});
							metric("runtime.mission.resume.failed", 1, { missionId });
						});
					} catch (error) {
						log({
							level: "error",
							event: "mission-resume-failed",
							missionId,
							error,
						});
						metric("runtime.mission.resume.failed", 1, { missionId });
					}
				}

				log({ level: "info", event: "tick-completed" });
				return true;
			} catch (error) {
				log({ level: "error", event: "tick-failed", error });
				metric("runtime.tick.failed", 1);
				return false;
			} finally {
				tickInFlight = undefined;
			}
		})();

		return tickInFlight;
	};

	const runtime: CommanderRuntime = {
		commander,
		identity,
		isTickRunning: () => tickInFlight !== undefined,
		start: async () => {
			if (running) {
				return;
			}
			await commander.waitUntilReady();
			running = true;
			stopping = false;
			await scheduleStartupStartAtTicks();
			log({ level: "info", event: "runtime-started" });
			await tick();
		},
		stop: async () => {
			if (!running && !tickInFlight) {
				return;
			}
			stopping = true;
			running = false;
			clearNextTickTimer();
			if (tickInFlight) {
				await tickInFlight;
			}
			commander.close();
			log({ level: "info", event: "runtime-stopped" });
		},
		tick,
		setNextTickAt,
		setNextTickIn,
	};

	return runtime;
}
