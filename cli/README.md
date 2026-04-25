# @mission-control/cli

`@mission-control/cli` provides JSON operator commands for Postgres-backed Mission Control runtimes.

Commands:

```bash
mission-control list --waiting
mission-control list --scheduled
mission-control inspect <missionId>
mission-control cancel <missionId> "operator reason"
```

The CLI does not bundle a Postgres client. Set `MISSION_CONTROL_POSTGRES_EXECUTE_MODULE` to a local ESM module that exports `execute(query, params?)` or a default execute function.

The package also exports `runMissionControlCli(...)` for tests and custom operator shells.
