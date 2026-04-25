# @mission-control/testing

`@mission-control/testing` contains both reusable helpers and a public-API adversarial suite for Mission Control.

## Helper Exports

- `FakeClock`: deterministic `EngineClock` implementation with `advanceBy(ms)`.
- `createDeferred<T>()`: deferred promise helper for race and ordering tests.

## Public API Coverage In This Folder

Runtime coverage in `testing/src/*.test.ts` includes:

- mission definition validation and duplicate name rejection
- start APIs by definition and by mission name
- handles from creation time and from `commander.getMission(...)`
- signaling from original and retrieved handles
- invalid signal names and payload shapes
- missing/extra/null/undefined payloads
- signals before start, after completion, during sleep, and during retry backoff
- cancellation idempotency behavior
- duplicate mission id behavior
- concurrency and stress flows (parallel mission start and parallel signaling)
- timer boundary behavior (zero and tiny durations)
- thrown non-`Error` values and failure recording
- sqlite durability/restart/resume behavior and recovery edge cases

TypeScript type coverage includes:

- start input inference from mission definitions
- signal name and payload inference
- `@ts-expect-error` cases for invalid names and invalid payloads
- typed mission handle checks for created and retrieved handles
- adversarial expectations around mission-name string ergonomics

## Running Runtime Tests

From repository root:

```bash
npm test
```

## Running Type Tests

From repository root:

```bash
npm run check-types
```

## Adversarial Intent

This suite is intentionally strict and user-focused. Some assertions may fail if public semantics are weak or inconsistent. Tests are designed to reveal behavior gaps rather than to maximize pass rate.

## Assumptions

- Node.js 24+ runtime with built-in TypeScript stripping.
- SQLite adapter is runnable in this repository.
- No PostgreSQL adapter is currently shipped, so postgres parity is represented as a TODO test.
