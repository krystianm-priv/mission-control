import type { MissionInspection } from "@mission-control/core";

export function formatMissionInspection(inspection: MissionInspection): string {
	return JSON.stringify(inspection, null, 2);
}
