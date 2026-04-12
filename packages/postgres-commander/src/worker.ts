import type { PostgresQueryClient } from "./store.js";
import { getClaimRunnableMissionsSql } from "./leasing.js";

export interface ClaimedMissionRow {
	mission_id: string;
}

export async function claimRunnableMissionIds(
	client: PostgresQueryClient,
	limit = 1,
): Promise<string[]> {
	const statement = getClaimRunnableMissionsSql(limit);
	const result = await client.query<ClaimedMissionRow>(
		statement.sql,
		statement.params,
	);
	return result.rows.map((row) => row.mission_id);
}
