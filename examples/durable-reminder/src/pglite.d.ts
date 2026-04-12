declare module "@electric-sql/pglite" {
	export class PGlite {
		public static create(
			dataDirOrOptions?: string | Record<string, unknown>,
			options?: Record<string, unknown>,
		): Promise<PGlite>;
		public exec(query: string): Promise<Array<{ rows?: Record<string, unknown>[] }>>;
		public close(): Promise<void>;
	}
}
