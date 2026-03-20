import {
  type AgentId,
  CommandId,
  type DelegationBatchId,
  DEFAULT_DELEGATION_CONFIG,
  DEFAULT_PROVIDER_INTERACTION_MODE,
  EventId,
  MessageId,
  type OrchestrationEvent,
  type TaskId,
  ThreadId,
} from "@t3tools/contracts";
import { Cause, Effect, Layer, Ref, Stream } from "effect";
import { makeDrainableWorker } from "@t3tools/shared/DrainableWorker";

import { OrchestrationEngineService } from "../Services/OrchestrationEngine.ts";
import {
  DelegationCoordinator,
  type DelegationCoordinatorShape,
} from "../Services/DelegationCoordinator.ts";

type DelegationEvent = Extract<
  OrchestrationEvent,
  {
    type: "delegation.batch-started" | "delegation.child-completed" | "task.updated";
  }
>;

interface ChildEntry {
  readonly childThreadId: ThreadId;
  readonly taskId: TaskId;
  readonly agentId: AgentId;
  readonly subject: string;
  readonly description: string;
  readonly blockedBy: ReadonlyArray<TaskId>;
  status: "queued" | "running" | "completed" | "failed";
}

interface BatchState {
  readonly parentThreadId: ThreadId;
  readonly delegationId: DelegationBatchId;
  readonly children: Array<ChildEntry>;
  readonly maxParallelChildren: number;
}

const serverCommandId = (tag: string): CommandId =>
  CommandId.makeUnsafe(`server:${tag}:${crypto.randomUUID()}`);

const nowIso = (): string => new Date().toISOString();

const make = Effect.gen(function* () {
  const orchestrationEngine = yield* OrchestrationEngineService;
  const batchesRef = yield* Ref.make<Map<string, BatchState>>(new Map());

  const startEligibleChildren = (batch: BatchState) =>
    Effect.gen(function* () {
      const completedTaskIds = new Set(
        batch.children
          .filter((child) => child.status === "completed")
          .map((child) => child.taskId),
      );
      const runningCount = batch.children.filter(
        (child) => child.status === "running",
      ).length;
      const availableSlots = Math.max(0, batch.maxParallelChildren - runningCount);

      const eligible = batch.children.filter(
        (child) =>
          child.status === "queued" &&
          child.blockedBy.every((dep) => completedTaskIds.has(dep)),
      );

      const toStart = eligible.slice(0, availableSlots);

      for (const child of toStart) {
        child.status = "running";
        yield* orchestrationEngine.dispatch({
          type: "thread.turn.start",
          commandId: serverCommandId("delegation-child-turn"),
          threadId: child.childThreadId,
          message: {
            messageId: MessageId.makeUnsafe(crypto.randomUUID()),
            role: "user",
            text: child.description,
            attachments: [],
          },
          agentId: child.agentId,
          runtimeMode: "full-access",
          interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
          createdAt: nowIso(),
        });
      }
    });

  const checkAllChildrenDone = (batch: BatchState) =>
    Effect.gen(function* () {
      const allDone = batch.children.every(
        (child) => child.status === "completed" || child.status === "failed",
      );
      if (!allDone) return;

      const summaryParts = batch.children.map(
        (child) => `- [${child.status}] ${child.subject}`,
      );
      const summaryText = `Delegation batch completed.\n${summaryParts.join("\n")}`;

      yield* orchestrationEngine.dispatch({
        type: "thread.turn.start",
        commandId: serverCommandId("delegation-batch-summary"),
        threadId: batch.parentThreadId,
        message: {
          messageId: MessageId.makeUnsafe(crypto.randomUUID()),
          role: "user",
          text: summaryText,
          attachments: [],
        },
        runtimeMode: "full-access",
        interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
        createdAt: nowIso(),
      });

      // Clean up batch state
      yield* Ref.update(batchesRef, (batches) => {
        const next = new Map(batches);
        next.delete(batch.delegationId);
        return next;
      });
    });

  const processBatchStarted = Effect.fnUntraced(function* (
    event: Extract<DelegationEvent, { type: "delegation.batch-started" }>,
  ) {
    const readModel = yield* orchestrationEngine.getReadModel();
    const parentThread = readModel.threads.find(
      (entry) => entry.id === event.payload.threadId,
    );
    if (!parentThread) return;

    // Build child entries with dependency info from thread tasks
    const children: Array<ChildEntry> = event.payload.children.map((child) => {
      const task = parentThread.delegationTasks.find(
        (t) => t.id === child.taskId,
      );
      return {
        childThreadId: child.childThreadId,
        taskId: child.taskId,
        agentId: child.agentId,
        subject: child.subject,
        description: child.description,
        blockedBy: task?.blockedBy ?? [],
        status: "queued" as const,
      };
    });

    const batch: BatchState = {
      parentThreadId: event.payload.threadId,
      delegationId: event.payload.delegationId,
      children,
      maxParallelChildren: DEFAULT_DELEGATION_CONFIG.maxParallelChildren,
    };

    yield* Ref.update(batchesRef, (batches) => {
      const next = new Map(batches);
      next.set(event.payload.delegationId, batch);
      return next;
    });

    yield* startEligibleChildren(batch);
  });

  const processChildCompleted = Effect.fnUntraced(function* (
    event: Extract<DelegationEvent, { type: "delegation.child-completed" }>,
  ) {
    const batches = yield* Ref.get(batchesRef);

    // Find the batch containing this child
    let targetBatch: BatchState | undefined;
    for (const batch of batches.values()) {
      const child = batch.children.find(
        (c) => c.childThreadId === event.payload.childThreadId,
      );
      if (child) {
        targetBatch = batch;
        child.status =
          event.payload.result === "completed" ? "completed" : "failed";
        break;
      }
    }

    if (!targetBatch) return;

    yield* startEligibleChildren(targetBatch);
    yield* checkAllChildrenDone(targetBatch);
  });

  const processTaskUpdated = Effect.fnUntraced(function* (
    event: Extract<DelegationEvent, { type: "task.updated" }>,
  ) {
    if (event.payload.status !== "completed") return;

    const batches = yield* Ref.get(batchesRef);
    // Check if this task completion unblocks any queued children
    for (const batch of batches.values()) {
      const hasBlockedChildren = batch.children.some(
        (child) =>
          child.status === "queued" &&
          child.blockedBy.includes(event.payload.taskId),
      );
      if (hasBlockedChildren) {
        yield* startEligibleChildren(batch);
      }
    }
  });

  const processDomainEvent = (event: DelegationEvent) =>
    Effect.gen(function* () {
      switch (event.type) {
        case "delegation.batch-started":
          yield* processBatchStarted(event);
          return;
        case "delegation.child-completed":
          yield* processChildCompleted(event);
          return;
        case "task.updated":
          yield* processTaskUpdated(event);
          return;
      }
    });

  const processDomainEventSafely = (event: DelegationEvent) =>
    processDomainEvent(event).pipe(
      Effect.catchCause((cause) => {
        if (Cause.hasInterruptsOnly(cause)) {
          return Effect.failCause(cause);
        }
        return Effect.logWarning(
          "delegation coordinator failed to process event",
          {
            eventType: event.type,
            cause: Cause.pretty(cause),
          },
        );
      }),
    );

  const worker = yield* makeDrainableWorker(processDomainEventSafely);

  const start: DelegationCoordinatorShape["start"] = Effect.forkScoped(
    Stream.runForEach(orchestrationEngine.streamDomainEvents, (event) => {
      if (
        event.type !== "delegation.batch-started" &&
        event.type !== "delegation.child-completed" &&
        event.type !== "task.updated"
      ) {
        return Effect.void;
      }
      return worker.enqueue(event);
    }),
  ).pipe(Effect.asVoid);

  return {
    start,
    drain: worker.drain,
  } satisfies DelegationCoordinatorShape;
});

export const DelegationCoordinatorLive = Layer.effect(DelegationCoordinator, make);
