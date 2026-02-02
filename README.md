# Missions — Concept Overview

This document explains the **Mission** concept from first principles for a reader (human or LLM) with **no prior context**.

It covers:

- What a Mission is
- How Mission Definitions work
- The role of the Mission Commander
- How execution & durability are separated
- How this relates to classic workflows (Temporal/DBOS/etc.)
- How context, events, and branching work
- A single concrete example (definition only, no runtime implementation)

You may assume a runtime exists, but this document does **not** define or depend on any particular one.

---

## 1. What Is a Mission?

A **Mission** is a *typed, event-driven workflow execution*.

- It represents **one run** of a predefined procedure.
- It progresses over time by reacting to **events**.
- It accumulates **context** (inputs and outputs) as it runs.
- It may **pause** waiting for external input and **resume** later.
- It eventually reaches a **terminal state** (success/failure) or a **waiting state**.

You can think of a mission as:

> A workflow instance that reacts to events and builds up context until it is done.

---

## 2. Mission Definition vs Mission Execution

### 2.1 Mission Definition

A **Mission Definition** describes *what should happen*.

It declares:

- A unique **mission name** (e.g. `"ask-for-review"`).
- The **start event** (what input is needed to begin).
- A chain of **steps** that run in order.
- Any explicit **external events** that must be provided later (e.g. `receive-review`).
- The **types** (schemas) for all inputs and outputs.
- How to **end** the mission.

A definition is *purely structural* and **agnostic** to:

- how it is persisted,
- how it is scheduled,
- how/where steps are executed (thread, worker, machine, etc.).

---

### 2.2 Mission (Execution)

A **Mission** (in the narrow sense) is **one execution** of a mission definition.

- If you define `"ask-for-review"`, each run is a separate mission:
  - `ask-for-review#mission-123`
  - `ask-for-review#mission-124`
- Each mission instance has:
  - its own **missionId**
  - its own **event history**
  - its own **context** (inputs/outputs)
  - its own **status** (derived from where it is in the procedure)

Conceptually:

> **Definition** = procedure  
> **Mission** = execution of that procedure

---

## 3. Missions Are Workflows (But with Clear Separation of Concerns)

Fundamentally, a mission *is* a **workflow**:

- It has a start.
- It has steps.
- It may wait for messages.
- It moves toward completion.

The **key difference** from many workflow engines is **separation of concerns**:

1. **Mission Definition**  
   - Describes *what* happens and *in what order*, with types and events.
   - No persistence, queues, or infrastructure are assumed.

2. **Mission Commander** (runtime orchestrator)  
   - Responsible for **executing** missions:
     - loading context (if persisted),
     - running steps,
     - emitting and reacting to events,
     - deciding which step to run next.
   - Designed to be **lightweight and persistence-agnostic**:
     - it doesn’t care *where* context is stored,
     - it just needs a way to get and set mission state.

3. **Durability Layer (optional)**  
   - A separate **executor/adapter** can attach durability:
     - database, filesystem, Temporal, DBOS, etc.
   - This layer can be swapped without changing mission definitions.

So:  
> Missions are workflows, but the **definition** is clean and type-first, and the **commander** is a light orchestrator that can run in memory or on top of any durability mechanism.

---

## 4. The Mission Commander

The **Mission Commander** is the component that:

- Knows about **mission definitions**.
- Creates new **mission instances**.
- Keeps track of:
  - **which step** should run next,
  - **which event** is awaited (if any),
  - **whether** a mission is completed or failed.
- Delegates actual work to **executors / workers**.

### 4.1 What the Commander Does *Not* Do

The commander is intentionally **thin**:

- It does **not** embed persistence logic (DB operations, queues).
- It does **not** assume a particular durability strategy.
- It does **not** hard-code infrastructure.

Instead, it exposes a small set of capabilities that can be backed by:

- in-memory maps,
- databases,
- queues,
- or external workflow engines.

---

## 5. Durability and External Executors

Missions are **persistence-agnostic by design**.

The same mission definition can be:

- **Ephemeral**:
  - Run fully in memory (e.g. tests or local workflows).
  - Lost when the process restarts.

- **Database-backed**:
  - Mission context and events persisted in a DB.
  - Commander rehydrates mission and continues.

- **Delegated to a durable workflow engine**:
  - Temporal: mission steps mapped to activities/workflows.
  - DBOS: mission steps mapped to durable functions.
  - Custom durable executor: you can implement your own.

The important part:

> Adding durability is done by plugging in a **durable executor** or adapter — the mission definitions themselves don’t need to change.

You can have multiple executors, for example:

- `InMemoryExecutor` for tests
- `DbExecutor` for production
- `TemporalExecutor` or `DbosExecutor` for heavy durability requirements
- Your own **custom durable executor** (e.g. filesystem, Rust-based, etc.)

All of these read the same mission definitions.

---

## 6. Events, Context, and Steps

### 6.1 Events

Missions move forward via **events**. Conceptually:

- `start` – starting event (with its input).
- named internal steps (e.g. `send-email`, `anti-spam`).
- explicit external events (e.g. `receive-review`).
- `end` – mission termination.

An event has:

- `input` (optional): data provided for that event.
- `output` (optional): data produced by the step responding to that event.

Events are stored in a **per-mission** event map, accessible via `ctx.events[...]`.

---

### 6.2 Context

The mission **context** is the accumulated view of everything that happened so far:

- `ctx.missionId` – the unique mission identifier.
- `ctx.events.*.input` – inputs for each event.
- `ctx.events.*.output` – outputs for each event.
- Any additional metadata attached by the commander or executor.

**Key property**:  
Context is effectively **append-only** and **derived from events**.  
Steps read from it; their outputs are added to it.

No step “passes parameters” to another step directly — they communicate *through* context.

---

### 6.3 Steps

A **step** is a piece of code that reacts to a specific point in the mission’s lifecycle.

In the chained API, steps are defined in order. Conceptually:

1. **Start step**
   - Defines input schema for mission start.
   - Runs when the mission starts.
   - Produces an output (e.g. a record id).

2. **Automatic steps**
   - Run sequentially after previous steps succeed.
   - Each step receives full context (`ctx`) and may:
     - use outputs from previous steps,
     - perform side effects,
     - return structured output.

3. **External event requirement (`needTo`)**
   - Explicitly declares that mission must receive a named external event.
   - Associates an input schema with that event.
   - Mission is considered **waiting** until that event is provided.

4. **End**
   - Marks the mission as completed.
   - After `.end()`, further steps are not part of this definition.

---

## 7. Branching and Status

### 7.1 Branching

Missions may or may not include **branching**, but the concept supports it:

- Steps can inspect context and return different values or throw errors.
- The commander (or future APIs) can support:
  - conditional paths (e.g. skip steps based on prior outputs),
  - early termination,
  - fan-out / fan-in patterns (implementation detail of commander/executor).

The core definition still describes a **single mission protocol**, but execution can follow different paths depending on context.

### 7.2 Status Is Derived

Mission **status** is not manually stored — it is **derived** from:

- which events have been recorded,
- whether the mission is currently waiting for an external event,
- whether the final `.end()` has been reached,
- whether an error has occurred.

Conceptually, a mission might be in states like:

- `"not-started"`
- `"running"`
- `"waiting-for:receive-review"`
- `"completed"`
- `"failed"`

But these are derived from event history and commander logic, not hard-coded into the definition.

---

## 8. Frontend vs Backend

Missions are **not** inherently backend-only.

They can be:

- **Frontend-only missions**:
  - e.g. a mission that manages “keep user logged in” or “progressive onboarding”.
  - context stored in memory, localStorage, or sessionStorage.
  - steps run on the client.

- **Backend-only missions**:
  - typical business flows, integrating with DBs, email, queues, etc.

- **Shared / synchronized missions**:
  - A mission may begin on the frontend, then:
    - hand off to backend,
    - or mirror state on both sides,
    - or resume when a backend event occurs.

The core idea is universal: **a procedure over time, driven by events, with context**.

---

## 9. Type-Safety and Schema-First Design

Mission definitions are **type-first**:

- Inputs and external events are declared with schemas (e.g. Zod).
- Types can be inferred from schemas.
- Steps receive a strongly-typed context (`ctx`).
- Accessing `ctx.events[...]` is type-safe (inputs/outputs known from definition).

This avoids:

- manually writing JSON configs,
- hand-syncing types between runtime and declarations.

The **chained API** (shown below) is designed to:

- express the mission protocol,
- infer types automatically,
- keep implementation code close to the definition while remaining declarative.

---

## 10. Example: Ask-for-Review Mission (Definition Only)

Below is the **canonical example** of a mission definition using the chained API.

> ⚠️ This is the **definition only**.  
> It assumes a commander, executor, and infrastructure exist, but does not define them.

```ts
import { m } from "@mission-control/core";
import { z } from "zod";
import {
	createReviewRequestRecord,
	fakeMailer,
	fakeSpamChecker,
	updateReviewRequestRecordWithReview,
} from "./utils.ts";

export const askForReviewMission = m
	.define("ask-for-review")
	.start({
		input: z.strictObject({ email: z.email() }),
		run: async ({ ctx }) => {
			return {
				recordId: await createReviewRequestRecord(ctx.events.start.input.email),
			};
		},
	})
	.step("send-email", async ({ ctx }) => {
		return await fakeMailer({
			to: ctx.events.start.input.email,
			content: `Please review the item with missionId: ${ctx.missionId}`,
		});
	})
	.needTo("receive-review", z.string())
	.step("anti-spam", async ({ ctx }) => {
		return {
			isSpam: await fakeSpamChecker(ctx.events["receive-review"].input),
		};
	})
	.step("update-record", async ({ ctx }) => {
		if (ctx.events["anti-spam"].output.isSpam) {
			throw new Error("Review content detected as spam.");
		}
		await updateReviewRequestRecordWithReview({
			id: ctx.events.start.output.recordId,
			review: ctx.events["receive-review"].input,
		});
		console.log("Review record updated successfully.");
		return {};
	})
	.end();
````

### 10.1 What This Example Expresses

Conceptually, without implementation details:

1. **Mission name**: `"ask-for-review"`.
2. **Start**:

   * Requires `{ email: string }` (validated as an email).
   * Creates a review request record.
   * Stores `recordId` as output of `start`.
3. **Step `send-email`**:

   * Sends mail to `ctx.events.start.input.email`.
   * Uses `ctx.missionId` in the email message.
4. **Need external event `receive-review`**:

   * Declares mission will pause until `"receive-review"` event is provided.
   * Expects a `string` as the review text.
5. **Step `anti-spam`**:

   * Checks if the review is spam.
   * Stores `{ isSpam: boolean }` as output.
6. **Step `update-record`**:

   * If spam → throws an error (mission can be marked failed).
   * If not spam → updates the review record with the review text.
   * Returns `{}`.
7. **End**:

   * Mission is considered completed once all steps succeed.

---

## 11. Summary

A **Mission** is:

* a **workflow** execution,
* defined declaratively and type-first,
* driven by **events** rather than imperative calls,
* accumulating context from all inputs and outputs,
* orchestrated by a lightweight, **persistence-agnostic** commander,
* able to plug into different **durability** layers (DB, Temporal, DBOS, custom executors),
* usable on **frontend and backend**,
* with **status** and behavior derived from its event history and definition.

The key philosophy:

> Define the **procedure** (mission definition) cleanly,
> let a **light commander** orchestrate it,
> and let **separate executors** decide how durable and distributed it should be.
