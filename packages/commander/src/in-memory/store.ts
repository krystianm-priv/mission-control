import type { EngineRuntime } from "../engine.js";

export interface InMemoryMissionStore {
	get(missionId: string): EngineRuntime | undefined;
	set(missionId: string, runtime: EngineRuntime): void;
	values(): Iterable<EngineRuntime>;
}

export function createInMemoryMissionStore(): InMemoryMissionStore {
	const store = new Map<string, EngineRuntime>();
	return {
		get: (missionId) => store.get(missionId),
		set: (missionId, runtime) => {
			store.set(missionId, runtime);
		},
		values: () => store.values(),
	};
}
