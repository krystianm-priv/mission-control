# durable-reminder example

This example demonstrates a durable reminder workflow using SQLite persistence.

What it covers:

- durable mission snapshot persistence via `createSqlitePersistenceAdapter(...)`
- waiting/sleep behavior and wake-up continuation
- restart-safe mission progression

Run tests:

```bash
node --test examples/durable-reminder/src/e2e.test.ts
```
