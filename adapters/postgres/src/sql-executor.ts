export type SqlRow = Record<string, unknown>;

export type PgCommanderExecute = (query: string) => Promise<unknown> | unknown;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function hasRows(value: unknown): value is { rows: SqlRow[] } {
	return isRecord(value) && Array.isArray(value["rows"]);
}

export async function executeStatement(
	execute: PgCommanderExecute,
	query: string,
): Promise<void> {
	await execute(query);
}

export async function executeRows(
	execute: PgCommanderExecute,
	query: string,
): Promise<SqlRow[]> {
	const result = await execute(query);

	if (Array.isArray(result)) {
		const withRows = [...result].reverse().find((entry) => hasRows(entry));
		if (withRows) {
			return withRows.rows;
		}

		if (result.every((entry) => isRecord(entry) && !("rows" in entry))) {
			return result as SqlRow[];
		}

		return [];
	}

	if (hasRows(result)) {
		return result.rows;
	}

	if (isRecord(result) && Array.isArray(result["result"])) {
		return result["result"] as SqlRow[];
	}

	return [];
}

export function sqlLiteral(
	value: boolean | number | string | null | undefined,
): string {
	if (value === null || value === undefined) {
		return "NULL";
	}

	if (typeof value === "boolean") {
		return value ? "TRUE" : "FALSE";
	}

	if (typeof value === "number") {
		if (!Number.isFinite(value)) {
			throw new Error("Cannot serialize a non-finite number into SQL.");
		}
		return String(value);
	}

	return `'${value.replaceAll("'", "''")}'`;
}
