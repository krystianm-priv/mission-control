import { POSTGRES_SCHEMA_STATEMENTS } from "../sql.js";

export const migration0001Init = {
	id: "0001_init",
	statements: POSTGRES_SCHEMA_STATEMENTS,
};
