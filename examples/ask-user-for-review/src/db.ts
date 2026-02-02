import { Database } from "bun:sqlite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";

const sqlite = new Database("user-review-requests.test.db");

export const userReviewRequests = sqliteTable("user_review_requests", {
	id: text("id").primaryKey(),
	email: text("email").notNull(),
	received_review: text("received_review"),
});

export const db = drizzle(sqlite);

db.run(sql`
	CREATE TABLE IF NOT EXISTS user_review_requests (
		id TEXT PRIMARY KEY,
		email TEXT NOT NULL,
		received_review TEXT
	)
`);
