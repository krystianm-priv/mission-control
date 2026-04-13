import { createRequire } from "node:module";

export interface SQLiteStatement {
	get(...params: unknown[]): unknown;
	all(...params: unknown[]): unknown[];
	run(...params: unknown[]): unknown;
}

export interface SQLiteDatabase {
	exec(sql: string): unknown;
	prepare(sql: string): SQLiteStatement;
	close(): unknown;
}

type SQLiteDatabaseConstructor = new (filename: string) => SQLiteDatabase;

const require = createRequire(import.meta.url);
let cachedConstructor: SQLiteDatabaseConstructor | undefined;

function tryRequire(specifier: string): SQLiteDatabaseConstructor | undefined {
	try {
		const moduleExports = require(specifier) as Record<string, unknown>;
		const candidate =
			(moduleExports["DatabaseSync"] as
				| SQLiteDatabaseConstructor
				| undefined) ??
			(moduleExports["Database"] as SQLiteDatabaseConstructor | undefined);
		return candidate;
	} catch {
		return undefined;
	}
}

export function getSQLiteDatabaseConstructor(): SQLiteDatabaseConstructor {
	if (cachedConstructor) {
		return cachedConstructor;
	}

	cachedConstructor = tryRequire("node:sqlite") ?? tryRequire("bun:sqlite");
	if (!cachedConstructor) {
		throw new Error(
			"Mission Control SQLite backend requires either node:sqlite or bun:sqlite.",
		);
	}

	return cachedConstructor;
}
