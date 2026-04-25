import assert from "node:assert/strict";
import test from "node:test";

import { formatMissionInspection, runMissionControlCli } from "./index.ts";

test("CLI entry point is intentionally unsupported for MVP", async () => {
	await assert.rejects(
		() => runMissionControlCli({ args: ["list", "--waiting"] }),
		/@mission-control\/cli is unsupported in the v1 MVP build\./,
	);
});

test("format helper still serializes inspections", () => {
	const json = formatMissionInspection({
		snapshot: {
			missionId: "m-1",
			missionName: "demo",
			status: "waiting",
			cursor: 0,
			error: undefined,
			ctx: { missionId: "m-1", events: {} },
			waiting: { kind: "signal", eventName: "approval", nodeIndex: 0 },
		},
		history: [],
		stepAttempts: [],
		signals: [],
		timers: [],
	});
	assert.match(json, /"missionId": "m-1"/);
});
