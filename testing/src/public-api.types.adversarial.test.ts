import test from "node:test";

import type { MissionDefinition, MissionHandle } from "@mission-control/core";
import { createCommander, m } from "@mission-control/core";

type Equal<A, B> =
	(<T>() => T extends A ? 1 : 2) extends
		(<T>() => T extends B ? 1 : 2)
		? true
		: false;
type Expect<T extends true> = T;

const expectType = <T>(_value: T): void => {};

const missionAlpha = m
	.define("alpha")
	.start({
		input: {
			parse: (input) => {
				const value = input as { orderId?: unknown; amount?: unknown };
				if (typeof value.orderId !== "string" || typeof value.amount !== "number") {
					throw new Error("Invalid alpha start input.");
				}
				return { orderId: value.orderId, amount: value.amount };
			},
		},
		run: async ({ ctx }) => ({ orderId: ctx.events.start.input.orderId }),
	})
	.needTo("approve", {
		parse: (input) => {
			const value = input as { approvedBy?: unknown };
			if (typeof value.approvedBy !== "string") {
				throw new Error("Invalid alpha signal.");
			}
			return { approvedBy: value.approvedBy };
		},
	})
	.end();

const missionBeta = m
	.define("beta")
	.start({
		input: {
			parse: (input) => {
				const value = input as { userId?: unknown };
				if (typeof value.userId !== "number") {
					throw new Error("Invalid beta start input.");
				}
				return { userId: value.userId };
			},
		},
		run: async ({ ctx }) => ({ userId: ctx.events.start.input.userId }),
	})
	.needTo("confirm", {
		parse: (input) => {
			const value = input as { token?: unknown };
			if (typeof value.token !== "string") {
				throw new Error("Invalid beta signal.");
			}
			return { token: value.token };
		},
	})
	.end();

const compileTimeAssertions = () => {
	const commander = createCommander({ definitions: [missionAlpha, missionBeta] });

	type _StartInputInference = Expect<
		Equal<
			typeof missionAlpha.context.events.start.input,
			{ orderId: string; amount: number }
		>
	>;
	void (null as unknown as _StartInputInference);

	type _SignalInputInference = Expect<
		Equal<
			typeof missionAlpha.context.events.approve.input,
			{ approvedBy: string }
		>
	>;
	void (null as unknown as _SignalInputInference);

	const handle = commander.createMission(missionAlpha);
	expectType<MissionHandle<typeof missionAlpha>>(handle);

	expectType<Promise<void>>(handle.start({ orderId: "o-1", amount: 100 }));
	expectType<Promise<void>>(handle.signal("approve", { approvedBy: "ops" }));

	// @ts-expect-error invalid signal event name should fail type checking
	void handle.signal("confirm", { token: "x" });
	// @ts-expect-error invalid signal payload field type should fail
	void handle.signal("approve", { approvedBy: 123 });
	// @ts-expect-error missing required signal payload field should fail
	void handle.signal("approve", {});
	// @ts-expect-error extra signal payload field should fail for object literals
	void handle.signal("approve", { approvedBy: "ops", extra: true });
	// @ts-expect-error invalid start input field type should fail
	void handle.start({ orderId: "o-2", amount: "100" });

	const typedStartByDefinition = commander.start(missionAlpha, {
		orderId: "o-3",
		amount: 33,
	});
	expectType<Promise<MissionHandle<typeof missionAlpha>>>(typedStartByDefinition);

	const typedStartByName = commander.start<typeof missionAlpha>("alpha", {
		orderId: "o-4",
		amount: 34,
	});
	expectType<Promise<MissionHandle<typeof missionAlpha>>>(typedStartByName);

	// Known limitation: start() accepts `M | string`, so TypeScript cannot statically
	// reject unregistered name literals from the string branch without a breaking
	// generic API redesign. Unregistered names fail at runtime, not compile time.

	const loadedAlpha = commander.getMission<typeof missionAlpha>("alpha-id");
	expectType<Promise<MissionHandle<typeof missionAlpha> | undefined>>(loadedAlpha);

	// Adversarial expectation for public ergonomics:
	// getMission without explicit generic should ideally preserve mission-specific typing.
	const loadedUnknown = commander.getMission("alpha-id");
	expectType<Promise<MissionHandle<MissionDefinition> | undefined>>(loadedUnknown);
};

void compileTimeAssertions;

test("types: file is included in runtime test discovery while assertions run in tsc", () => {});
