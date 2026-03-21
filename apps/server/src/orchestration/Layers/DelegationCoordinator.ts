import {
  type AgentId,
  CommandId,
  type DelegationBatchId,
  DEFAULT_DELEGATION_CONFIG,
  DEFAULT_PROVIDER_INTERACTION_MODE,
  MessageId,
  type OrchestrationEvent,
  type TaskId,
  ThreadId,
} from "@t3tools/contracts";
import { Cause, Duration, Effect, Layer, Ref, Stream } from "effect";
import { makeDrainableWorker } from "@t3tools/shared/DrainableWorker";

import { OrchestrationEngineService } from "../Services/OrchestrationEngine.ts";
import {
  DelegationCoordinator,
  type DelegationCoordinatorShape,
} from "../Services/DelegationCoordinator.ts";
import { ProviderService } from "../../provider/Services/ProviderService.ts";
import { AgentCatalogService } from "../../agent/Services/AgentCatalog.ts";

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
  readonly prompt?: string;
  readonly blockedBy: ReadonlyArray<TaskId>;
  status: "queued" | "running" | "completed" | "failed";
  summary?: string;
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

const DEFAULT_DELEGATION_TIMEOUT_MINUTES = 30;

const _delegLog = (msg: string) => {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try { require("node:fs").appendFileSync("/tmp/t3-delegation-debug.log", line); } catch {}
};

const make = Effect.gen(function* () {
  const orchestrationEngine = yield* OrchestrationEngineService;
  const providerService = yield* ProviderService;
  const agentCatalog = yield* AgentCatalogService;
  const batchesRef = yield* Ref.make<Map<string, BatchState>>(new Map());
  const activeTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

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
      _delegLog(`[3-COORDINATOR] startEligible: running=${runningCount} eligible=${eligible.length} toStart=${toStart.length} slots=${availableSlots}`);

      for (const child of toStart) {
        child.status = "running";
        _delegLog(`[3-COORDINATOR] starting child agent=${child.agentId} childThreadId=${child.childThreadId}`);
        yield* orchestrationEngine.dispatch({
          type: "thread.turn.start",
          commandId: serverCommandId("delegation-child-turn"),
          threadId: child.childThreadId,
          message: {
            messageId: MessageId.makeUnsafe(crypto.randomUUID()),
            role: "user",
            text: child.prompt ?? child.description,
            attachments: [],
          },
          agentId: child.agentId,
          runtimeMode: "full-access",
          interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
          createdAt: nowIso(),
        });

        // Set a timeout for this child based on the agent's delegation policy.
        const agentDef = yield* agentCatalog.getAgent(child.agentId);
        const timeoutMinutes = agentDef?.delegationPolicy.defaultTimeoutMinutes
          ?? DEFAULT_DELEGATION_TIMEOUT_MINUTES;
        const timeoutMs = timeoutMinutes * 60 * 1000;
        const childKey = child.childThreadId;
        const timeout = setTimeout(() => {
          // Fire timeout: interrupt the child and mark as failed.
          activeTimeouts.delete(childKey);
          const timeoutEffect = Effect.gen(function* () {
            yield* providerService.interruptTurn({ threadId: child.childThreadId });
            yield* orchestrationEngine.dispatch({
              type: "delegation.child.complete",
              commandId: serverCommandId("delegation-child-timeout"),
              childThreadId: child.childThreadId,
              taskId: child.taskId,
              result: "failed",
              summary: `Delegation timed out after ${timeoutMinutes} minutes`,
              createdAt: nowIso(),
            });
          }).pipe(
            Effect.catchCause((cause) =>
              Effect.logWarning("delegation child timeout handling failed", {
                childThreadId: child.childThreadId,
                cause: Cause.pretty(cause),
              }),
            ),
          );
          // Run the timeout effect — best-effort, fire-and-forget
          Effect.runFork(timeoutEffect);
        }, timeoutMs);
        activeTimeouts.set(childKey, timeout);
      }
    });

  const cleanupBatchIfDone = (batch: BatchState) =>
    Effect.gen(function* () {
      const allDone = batch.children.every(
        (child) => child.status === "completed" || child.status === "failed",
      );
      if (!allDone) return;
      // All children finished. Results are delivered inline via the MCP tool
      // response (wait=true). Just clean up batch state.
      yield* Ref.update(batchesRef, (batches) => {
        const next = new Map(batches);
        next.delete(batch.delegationId);
        return next;
      });
    });

  const processBatchStarted = Effect.fnUntraced(function* (
    event: Extract<DelegationEvent, { type: "delegation.batch-started" }>,
  ) {
    _delegLog(`[3-BATCH-START] delegationId=${event.payload.delegationId} children=${event.payload.children.length} parentThreadId=${event.payload.threadId}`);
    const readModel = yield* orchestrationEngine.getReadModel();
    const parentThread = readModel.threads.find(
      (entry) => entry.id === event.payload.threadId,
    );
    if (!parentThread) {
      _delegLog(`[3-BATCH-START-MISS] parent thread not found: ${event.payload.threadId}`);
      return;
    }

    // Build child entries with dependency info from thread tasks
    const children: Array<ChildEntry> = event.payload.children.map((child): ChildEntry => {
      const task = parentThread.delegationTasks.find(
        (t) => t.id === child.taskId,
      );
      return {
        childThreadId: child.childThreadId,
        taskId: child.taskId,
        agentId: child.agentId,
        subject: child.subject,
        description: child.description,
        ...(child.prompt !== undefined ? { prompt: child.prompt } : {}),
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

    _delegLog(`[5-CHILD-COMPLETE] childThreadId=${event.payload.childThreadId} result=${event.payload.result}`);
    // Find the batch containing this child
    let targetBatch: BatchState | undefined;
    let completedChild: ChildEntry | undefined;
    for (const batch of batches.values()) {
      const child = batch.children.find(
        (c) => c.childThreadId === event.payload.childThreadId,
      );
      if (child) {
        targetBatch = batch;
        completedChild = child;
        child.status =
          event.payload.result === "completed" ? "completed" : "failed";
        child.summary = (event.payload as { summary?: string }).summary;
        break;
      }
    }

    if (!targetBatch) return;

    // Clear the timeout for the completed child.
    const childTimeout = activeTimeouts.get(event.payload.childThreadId);
    if (childTimeout) {
      clearTimeout(childTimeout);
      activeTimeouts.delete(event.payload.childThreadId);
    }

    // Resolve any pending sync delegation on the parent's adapter so that
    // the parent's delegate_task(wait=true) tool call unblocks.
    if (completedChild) {
      yield* providerService.resolveDelegation({
        parentThreadId: targetBatch.parentThreadId,
        childThreadId: event.payload.childThreadId,
        taskId: completedChild.taskId,
        result: event.payload.result === "completed" ? "completed" : "failed",
        summary: completedChild.summary,
      }).pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning("delegation coordinator failed to resolve pending delegation", {
            parentThreadId: targetBatch!.parentThreadId,
            childThreadId: event.payload.childThreadId,
            cause: Cause.pretty(cause),
          }),
        ),
      );
    }

    yield* startEligibleChildren(targetBatch);
    yield* cleanupBatchIfDone(targetBatch);
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
