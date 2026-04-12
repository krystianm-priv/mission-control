import { CLAIM_RUNNABLE_MISSIONS_SQL } from "./sql.js";

export function getClaimRunnableMissionsSql(limit: number): {
	sql: string;
	params: readonly [number];
} {
	return {
		sql: CLAIM_RUNNABLE_MISSIONS_SQL,
		params: [limit],
	};
}
