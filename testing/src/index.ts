import type { EngineClock } from "@mission-control/core";

export class FakeClock implements EngineClock {
	private nowMs = 0;
	private readonly tasks: Array<{ dueAt: number; resolve: () => void }> = [];

	public now(): Date {
		return new Date(this.nowMs);
	}

	public sleep(ms: number): Promise<void> {
		return new Promise((resolve) => {
			this.tasks.push({ dueAt: this.nowMs + ms, resolve });
		});
	}

	public async advanceBy(ms: number): Promise<void> {
		this.nowMs += ms;
		const ready = this.tasks.filter((task) => task.dueAt <= this.nowMs);
		this.tasks.splice(
			0,
			this.tasks.length,
			...this.tasks.filter((task) => task.dueAt > this.nowMs),
		);
		for (const task of ready) {
			task.resolve();
			await Promise.resolve();
		}
	}
}

export function createDeferred<T>() {
	let resolveRef!: (value: T | PromiseLike<T>) => void;
	let rejectRef!: (reason?: unknown) => void;
	const promise = new Promise<T>((resolve, reject) => {
		resolveRef = resolve;
		rejectRef = reject;
	});
	return {
		promise,
		resolve: resolveRef,
		reject: rejectRef,
	};
}
