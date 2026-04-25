# Changelog

## 1.0.0-rc.1

### Highlights

- Mission Control MVP runtime semantics now center on a single-instance, tick-driven execution model.
- Supported adapters for MVP are in-memory and sqlite.
- Postgres adapter support was removed from this repository.
- The CLI package is retained as private/unsupported placeholder surface.

### Breaking changes from earlier runtime shape

- Removed polling/claim orchestration behavior from runtime APIs.
- Removed lease/claim style configuration and task-claim callbacks.
- Removed Postgres adapter package and related integrations.

### Migration notes

- Replace polling-driven orchestration with explicit `tick()` scheduling.
- Use `setNextTickAt(...)` or `setNextTickIn(...)` to schedule follow-up ticks.
- Keep external side effects idempotent; runtime durability remains mission-state focused and at-least-once for side effects.

### Packaging and release notes

- `@mission-control/adapter-sqlite` is now part of the MVP supported package set.
- Package manifest metadata has been aligned for ESM/type entrypoint consistency across published packages.
