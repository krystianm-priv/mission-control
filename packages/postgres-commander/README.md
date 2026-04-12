# @mission-control/postgres-commander

`@mission-control/postgres-commander` is the durable package for Mission Control.

This repository run includes the package structure needed for the durable runtime:

- schema DDL in [src/sql.ts](src/sql.ts)
- initial migration in [src/migrations/0001_init.ts](src/migrations/0001_init.ts)
- serialization helpers in [src/serialization.ts](src/serialization.ts)
- store/query primitives in [src/store.ts](src/store.ts)
- leasing/claim SQL in [src/leasing.ts](src/leasing.ts)
- worker-facing claim helper in [src/worker.ts](src/worker.ts)

## Current limitation

The durable runtime itself still requires a real Postgres client and database to validate end-to-end mission execution, crash recovery, retries, timers, idempotency, and multi-worker behavior.
