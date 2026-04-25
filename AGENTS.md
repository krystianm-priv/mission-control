# AGENTS.md

## Purpose

Use this file as the default operating manual for coding agents working in this repository.

Mission Control is a Node.js 24+ TypeScript workflow runtime for long-lived mission flows. The repository is now organized around publishable source-first packages, a runtime-neutral core, explicit adapters, and a single-instance MVP runtime model.

## Source Of Truth

Use the current code, package manifests, root README, and package READMEs as the source of truth.

Do not rely on removed planning files or old claims from stale diffs. If docs and code conflict, inspect the implementation and update the docs as part of the change.

## Native Node.js Rules

- Use strict ESM.
- Keep `"type": "module"` in package manifests.
- Target Node.js 24+.
- Run TypeScript source directly with Node type stripping.
- Use exact `.ts` import extensions.
- Use `node:test` and `node:assert/strict`.
- Do not add bundlers, transpilers, `tsx`, `ts-node`, Babel, SWC, esbuild, or Vite unless explicitly requested.
- Do not add unnecessary runtime dependencies.

## Product Boundaries

Primary package areas:

- `core`: mission DSL, shared engine, contracts, validation, retry/timer primitives, and runtime-neutral durable contracts.
- `runtime`: managed embedded runtime loop, startup recovery ticks, next-tick scheduling, shutdown, logs, and metric hooks.
- `client`: mission-native application client helpers.
- `testing`: shared test helpers.
- `adapters/in-memory`: explicit local runtime adapter.
- `adapters/sqlite`: durable MVP adapter for restart-safe mission persistence.
- `examples/*`: runnable examples for public usage patterns.

`core` must stay free of SQL, ORM, queue, and backend-specific logic. Durable backend behavior belongs in `adapters/*`.

## Runtime Semantics

Mission Control is durable for mission state, waits, retries, timers, cancellation records, and recovery coordination.

External side effects are still at-least-once. Application code remains responsible for idempotency when a crash can happen between a side effect and the next persisted mission state.

The MVP runtime is single-instance and tick-driven. Do not describe unsupported exactly-once side-effect behavior, claim/lease orchestration, or broad distributed guarantees.

## Human-Invoked Generation Policy

- Agents must not run dependency install/update commands that generate or modify lockfiles.
- Agents must not run file-generation commands that create generated artifacts (including lockfiles).
- Any dependency update, lockfile change, or generated-file action must be invoked by a human.

## Versioning And Release Notes

- When public package APIs or runtime semantics change, update release notes/changelog entries in the same change set.
- Keep package versioning decisions explicit and human-approved; do not silently bump versions.
- Ensure published package metadata (`main`, `types`, `exports`, `files`, `engines`) stays consistent across supported packages.

## Execution Rules

- Keep diffs tight and scoped.
- Preserve explicit runtime semantics.
- Preserve strict types.
- Add or update focused tests for behavior changes.
- Update docs when public APIs, package boundaries, or guarantees change.
- Do not move backend-specific persistence details into `core`.
- Do not add visual builders, browser-first runtimes, Temporal/DBOS bridge layers, or speculative backend abstractions unless explicitly requested.

## Definition Of Done

A coding task is complete only when:

- code typechecks in the target environment
- changed behavior has focused tests
- public exports are correct
- docs match the implemented behavior
- package contents still match the source-first runtime story
- validation results are reported clearly

