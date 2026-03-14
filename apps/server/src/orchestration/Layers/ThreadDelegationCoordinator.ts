import {
  type DelegationBatchStatus,
  type DelegationWorkspaceMode,
  ApprovalRequestId,
  CommandId,
  EventId,
  MessageId,
  ThreadId,
  type OrchestrationEvent,
  type ProviderRuntimeEvent,
} from "@t3tools/contracts";
import { Effect, Layer, Queue, Stream } from "effect";

import { GitCore } from "../../git/Services/GitCore.ts";
import { ProviderService } from "../../provider/Services/ProviderService.ts";
import { buildDelegationBootstrapMessages } from "../delegationContext.ts";
import {
  createDelegateThreadsToolFailureResult,
  createDelegateThreadsToolSuccessResult,
  DELEGATE_THREADS_TOOL_NAME,
  MAX_DELEGATION_CONCURRENCY,
  MAX_DELEGATION_TASKS,
} from "../delegationTool.ts";
import { OrchestrationEngineService } from "../Services/OrchestrationEngine.ts";
import {
  ThreadDelegationCoordinator,
  type ThreadDelegationCoordinatorShape,
} from "../Services/ThreadDelegationCoordinator.ts";

const DELEGATION_PROMPT_PREFIX =
  "You are executing one delegated task from a parent thread. Focus only on the assigned task and report results clearly.";

interface DelegationTaskInput {
  title: string;
  prompt: string;
}

interface LiveBatchChild {
  threadId: ThreadId;
  title: string;
  prompt: string;
  status: "queued" | "running" | "blocked" | "completed" | "failed" | "cancelled";
  worktreePath: string | null;
  branch: string | null;
  runtimeMode: "approval-required" | "full-access";
  interactionMode: "default" | "plan";
}

interface LiveBatch {
  batchId: string;
  parentThreadId: ThreadId;
  requestId: ApprovalRequestId;
  workspaceMode: DelegationWorkspaceMode;
  concurrencyLimit: number;
  children: LiveBatchChild[];
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asArray(value: unknown): ReadonlyArray<unknown> | null {
  return Array.isArray(value) ? value : null;
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    try {
      return asObject(JSON.parse(value));
    } catch {
      return null;
    }
  }
  return asObject(value);
}

function truncate(text: string, max = 2_000): string {
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function slugify(text: string, fallback: string): string {
  const normalized = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return normalized.length > 0 ? normalized : fallback;
}

function parseDelegateThreadsRequest(args: unknown): {
  tasks: ReadonlyArray<DelegationTaskInput>;
  workspaceMode: DelegationWorkspaceMode;
  concurrencyLimit: number;
} | null {
  const raw = asObject(args);
  if (!raw) {
    return null;
  }

  const toolName =
    asString(raw.name) ??
    asString(raw.toolName) ??
    asString(raw.tool) ??
    asString(asObject(raw.tool)?.name) ??
    (raw.tasks !== undefined ? DELEGATE_THREADS_TOOL_NAME : null);
  if (toolName !== DELEGATE_THREADS_TOOL_NAME) {
    return null;
  }

  const payload =
    parseJsonObject(raw.arguments) ??
    parseJsonObject(raw.args) ??
    parseJsonObject(raw.input) ??
    raw;
  if (!payload) {
    return null;
  }

  const rawTasks = asArray(payload.tasks);
  if (!rawTasks || rawTasks.length === 0 || rawTasks.length > MAX_DELEGATION_TASKS) {
    return null;
  }

  const tasks = rawTasks.flatMap((entry, index) => {
    const record = asObject(entry);
    const prompt = asString(record?.prompt)?.trim() ?? "";
    if (prompt.length === 0) {
      return [];
    }
    const title = asString(record?.title)?.trim() || `Task ${index + 1}`;
    return [{ title, prompt }];
  });
  if (tasks.length === 0) {
    return null;
  }

  const workspaceMode =
    payload.workspaceMode === "separate-worktree" ? "separate-worktree" : "same-worktree";
  const requestedConcurrency =
    typeof payload.concurrencyLimit === "number" && Number.isFinite(payload.concurrencyLimit)
      ? Math.max(1, Math.trunc(payload.concurrencyLimit))
      : MAX_DELEGATION_CONCURRENCY;

  return {
    tasks,
    workspaceMode,
    concurrencyLimit: Math.min(requestedConcurrency, MAX_DELEGATION_CONCURRENCY),
  };
}

function isTerminalStatus(status: LiveBatchChild["status"]): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

function toChildTerminalStatus(
  latestTurnState: "completed" | "error" | "interrupted",
): "completed" | "failed" | "cancelled" {
  switch (latestTurnState) {
    case "completed":
      return "completed";
    case "interrupted":
      return "cancelled";
    default:
      return "failed";
  }
}

function batchStatusFromChildren(children: ReadonlyArray<LiveBatchChild>): DelegationBatchStatus {
  const terminalChildren = children.filter((child) => isTerminalStatus(child.status));
  const completedCount = terminalChildren.filter((child) => child.status === "completed").length;
  const failedCount = terminalChildren.length - completedCount;
  if (completedCount === terminalChildren.length) {
    return "completed";
  }
  if (completedCount > 0 && failedCount > 0) {
    return "completed_with_failures";
  }
  return "failed";
}

function formatChildPrompt(prompt: string): string {
  return `${DELEGATION_PROMPT_PREFIX}\n\n${prompt}`;
}

const makeThreadDelegationCoordinator = Effect.gen(function* () {
  const engine = yield* OrchestrationEngineService;
  const providerService = yield* ProviderService;
  const gitCore = yield* GitCore;
  const queue = yield* Queue.unbounded<
    | { type: "provider"; event: ProviderRuntimeEvent }
    | { type: "domain"; event: OrchestrationEvent }
  >();
  const liveBatches = new Map<string, LiveBatch>();

  const enqueueProviderEvents = Stream.runForEach(providerService.streamEvents, (event) =>
    Queue.offer(queue, { type: "provider", event }),
  );

  const markOrphanedRunningBatches = Effect.gen(function* () {
    const readModel = yield* engine.getReadModel();
    for (const thread of readModel.threads) {
      for (const batch of thread.delegationBatches.filter((entry) => entry.status === "running")) {
        const now = new Date().toISOString();
        yield* engine.dispatch({
          type: "thread.delegation.batch.complete",
          commandId: CommandId.makeUnsafe(`delegation:orphan:${batch.batchId}`),
          parentThreadId: thread.id,
          batchId: batch.batchId,
          status: "failed",
          completedAt: now,
          createdAt: now,
        });
        yield* engine.dispatch({
          type: "thread.activity.append",
          commandId: CommandId.makeUnsafe(`delegation:orphan-activity:${batch.batchId}`),
          threadId: thread.id,
          activity: {
            id: CommandId.makeUnsafe(`delegation:orphan-activity:${batch.batchId}`) as never,
            tone: "error",
            kind: "delegation.interrupted",
            summary: "Delegation control was interrupted",
            payload: {
              batchId: batch.batchId,
            },
            turnId: null,
            createdAt: now,
          },
          createdAt: now,
        });
      }
    }
  });

  const resolveBaseBranch = Effect.fn(function* (parentThreadId: ThreadId) {
    const readModel = yield* engine.getReadModel();
    const parentThread = readModel.threads.find((thread) => thread.id === parentThreadId);
    if (!parentThread) {
      return null;
    }
    if (parentThread.branch) {
      return parentThread.branch;
    }
    const project = readModel.projects.find((entry) => entry.id === parentThread.projectId);
    if (!project) {
      return null;
    }
    const status = yield* gitCore.status({ cwd: project.workspaceRoot });
    return status.branch;
  });

  const mirrorParentActivity = Effect.fn(function* (input: {
    parentThreadId: ThreadId;
    tone: "info" | "approval" | "error";
    kind: string;
    summary: string;
    payload: unknown;
  }) {
    const now = new Date().toISOString();
    yield* engine.dispatch({
      type: "thread.activity.append",
      commandId: CommandId.makeUnsafe(`delegation:activity:${crypto.randomUUID()}`),
      threadId: input.parentThreadId,
      activity: {
        id: EventId.makeUnsafe(`delegation-activity-${crypto.randomUUID()}`),
        tone: input.tone,
        kind: input.kind,
        summary: input.summary,
        payload: input.payload,
        turnId: null,
        createdAt: now,
      },
      createdAt: now,
    });
  });

  const completeBatchIfDone = Effect.fn(function* (batchId: string) {
    const batch = liveBatches.get(batchId);
    if (!batch) {
      return;
    }
    if (!batch.children.every((child) => isTerminalStatus(child.status))) {
      return;
    }

    const now = new Date().toISOString();
    const status = batchStatusFromChildren(batch.children);
    yield* engine.dispatch({
      type: "thread.delegation.batch.complete",
      commandId: CommandId.makeUnsafe(`delegation:batch-complete:${batchId}`),
      parentThreadId: batch.parentThreadId,
      batchId,
      status,
      completedAt: now,
      createdAt: now,
    });
    yield* providerService.resolveToolCall({
      threadId: batch.parentThreadId,
      requestId: batch.requestId,
      result: createDelegateThreadsToolSuccessResult({
        batchId,
        status,
        workspaceMode: batch.workspaceMode,
        children: batch.children.map((child) => ({
          childThreadId: child.threadId,
          title: child.title,
          status: child.status,
          branch: child.branch,
          worktreePath: child.worktreePath,
        })),
      }),
    });
    liveBatches.delete(batchId);
  });

  const maybeStartQueuedChildren = Effect.fn(function* (batchId: string) {
    const batch = liveBatches.get(batchId);
    if (!batch) {
      return;
    }
    const runningCount = batch.children.filter(
      (child) => child.status === "running" || child.status === "blocked",
    ).length;
    const availableSlots = Math.max(0, batch.concurrencyLimit - runningCount);
    if (availableSlots === 0) {
      return;
    }

    const nextChildren = batch.children
      .filter((child) => child.status === "queued")
      .slice(0, availableSlots);
    for (const child of nextChildren) {
      child.status = "running";
      const now = new Date().toISOString();
      yield* engine.dispatch({
        type: "thread.delegation.child-status.set",
        commandId: CommandId.makeUnsafe(
          `delegation:child-status:${child.threadId}:${crypto.randomUUID()}`,
        ),
        parentThreadId: batch.parentThreadId,
        batchId,
        childThreadId: child.threadId,
        status: "running",
        updatedAt: now,
        createdAt: now,
      });
      yield* engine.dispatch({
        type: "thread.turn.start",
        commandId: CommandId.makeUnsafe(
          `delegation:child-turn:${child.threadId}:${crypto.randomUUID()}`,
        ),
        threadId: child.threadId,
        message: {
          messageId: MessageId.makeUnsafe(crypto.randomUUID()),
          role: "user",
          text: formatChildPrompt(child.prompt),
          attachments: [],
        },
        runtimeMode: child.runtimeMode,
        interactionMode: child.interactionMode,
        createdAt: now,
      });
    }
  });

  const spawnDelegationBatch = Effect.fn(function* (
    event: Extract<ProviderRuntimeEvent, { type: "request.opened" }>,
  ) {
    if (event.payload.requestType !== "dynamic_tool_call" || !event.requestId) {
      return;
    }
    const toolRequestId = ApprovalRequestId.makeUnsafe(String(event.requestId));

    const request = parseDelegateThreadsRequest(event.payload.args);
    if (!request) {
      return;
    }

    const readModel = yield* engine.getReadModel();
    const parentThread = readModel.threads.find((thread) => thread.id === event.threadId);
    if (!parentThread) {
      return;
    }
    if (parentThread.lineage.role !== "primary" || parentThread.lineage.delegationDepth !== 0) {
      yield* providerService.resolveToolCall({
        threadId: event.threadId,
        requestId: toolRequestId,
        result: createDelegateThreadsToolFailureResult("Nested delegation is not supported in v1."),
      });
      return;
    }
    if (parentThread.delegationBatches.some((batch) => batch.status === "running")) {
      yield* providerService.resolveToolCall({
        threadId: event.threadId,
        requestId: toolRequestId,
        result: createDelegateThreadsToolFailureResult(
          "This thread already has a running delegation batch.",
        ),
      });
      return;
    }

    const project = readModel.projects.find((entry) => entry.id === parentThread.projectId);
    if (!project) {
      yield* providerService.resolveToolCall({
        threadId: event.threadId,
        requestId: toolRequestId,
        result: createDelegateThreadsToolFailureResult(
          "Delegation runtime dependencies are unavailable.",
        ),
      });
      return;
    }

    const batchId = crypto.randomUUID();
    const baseBranch =
      request.workspaceMode === "separate-worktree"
        ? yield* resolveBaseBranch(event.threadId)
        : null;
    if (request.workspaceMode === "separate-worktree" && !baseBranch) {
      yield* providerService.resolveToolCall({
        threadId: event.threadId,
        requestId: toolRequestId,
        result: createDelegateThreadsToolFailureResult(
          "Could not resolve a base branch for separate-worktree delegation.",
        ),
      });
      return;
    }

    const childSpecs = yield* Effect.forEach(
      request.tasks,
      (task, taskIndex) =>
        Effect.gen(function* () {
          const threadId = ThreadId.makeUnsafe(crypto.randomUUID());
          const bootstrapMessages = buildDelegationBootstrapMessages({
            parentThreadId: event.threadId,
            parentThreadTitle: parentThread.title,
            branch: parentThread.branch,
            worktreePath: parentThread.worktreePath,
            createdAt: new Date().toISOString(),
          });

          let branch = parentThread.branch;
          let worktreePath = parentThread.worktreePath;
          let startError: string | null = null;
          if (request.workspaceMode === "separate-worktree" && baseBranch) {
            const newBranch = `t3code/delegation/${parentThread.id.slice(0, 8)}/${batchId.slice(0, 8)}/${taskIndex + 1}-${slugify(task.title, `task-${taskIndex + 1}`)}`;
            const worktree = yield* gitCore
              .createWorktree({
                cwd: project.workspaceRoot,
                branch: baseBranch,
                newBranch,
                path: null,
              })
              .pipe(Effect.catch(() => Effect.succeed(null)));
            if (worktree) {
              branch = worktree.worktree.branch;
              worktreePath = worktree.worktree.path;
            } else {
              branch = newBranch;
              worktreePath = null;
              startError = "Failed to create a separate worktree for this delegated task.";
            }
          }

          return {
            threadId,
            title: task.title,
            prompt: task.prompt,
            model: parentThread.model,
            runtimeMode: parentThread.runtimeMode,
            interactionMode: parentThread.interactionMode,
            branch,
            worktreePath,
            forkSourceThreadId: event.threadId,
            createdAt: new Date().toISOString(),
            messages: bootstrapMessages,
            startError,
          };
        }),
      { concurrency: 1 },
    );

    const now = new Date().toISOString();
    yield* engine.dispatch({
      type: "thread.delegation.spawn.materialized",
      commandId: CommandId.makeUnsafe(`delegation:spawn:${batchId}`),
      parentThreadId: event.threadId,
      batchId,
      parentTurnId: event.turnId ?? null,
      workspaceMode: request.workspaceMode,
      concurrencyLimit: request.concurrencyLimit,
      children: childSpecs.map(({ startError: _startError, ...child }) => child),
      createdAt: now,
    });

    liveBatches.set(batchId, {
      batchId,
      parentThreadId: event.threadId,
      requestId: toolRequestId,
      workspaceMode: request.workspaceMode,
      concurrencyLimit: request.concurrencyLimit,
      children: childSpecs.map((child) => ({
        threadId: child.threadId,
        title: child.title,
        prompt: child.prompt,
        status: child.startError ? "failed" : "queued",
        branch: child.branch,
        worktreePath: child.worktreePath,
        runtimeMode: child.runtimeMode,
        interactionMode: child.interactionMode,
      })),
    });
    for (const child of childSpecs.filter((entry) => entry.startError)) {
      yield* engine.dispatch({
        type: "thread.delegation.child-result.record",
        commandId: CommandId.makeUnsafe(`delegation:start-failed:${child.threadId}`),
        parentThreadId: event.threadId,
        batchId,
        childThreadId: child.threadId,
        status: "failed",
        summary: child.startError,
        error: child.startError,
        completedAt: now,
        createdAt: now,
      });
    }
    yield* maybeStartQueuedChildren(batchId);
    yield* completeBatchIfDone(batchId);
  });

  const maybeHandleChildDomainEvent = Effect.fn(function* (event: OrchestrationEvent) {
    const readModel = yield* engine.getReadModel();
    for (const batch of liveBatches.values()) {
      const child = batch.children.find((entry) => entry.threadId === event.aggregateId);
      if (!child) {
        continue;
      }

      if (event.type === "thread.activity-appended") {
        const activityPayload = asObject(event.payload.activity.payload);
        const blockingRequestIdRaw = asString(activityPayload?.requestId);
        const blockingRequestId =
          blockingRequestIdRaw !== null ? ApprovalRequestId.makeUnsafe(blockingRequestIdRaw) : null;
        if (event.payload.activity.kind === "approval.requested") {
          child.status = "blocked";
          yield* engine.dispatch({
            type: "thread.delegation.child-status.set",
            commandId: CommandId.makeUnsafe(
              `delegation:block:${child.threadId}:${crypto.randomUUID()}`,
            ),
            parentThreadId: batch.parentThreadId,
            batchId: batch.batchId,
            childThreadId: child.threadId,
            status: "blocked",
            blockingRequestId,
            blockingKind: "approval",
            updatedAt: event.occurredAt,
            createdAt: event.occurredAt,
          });
          yield* mirrorParentActivity({
            parentThreadId: batch.parentThreadId,
            tone: "approval",
            kind: "delegation.child-blocked",
            summary: `${child.title}: approval requested`,
            payload: {
              batchId: batch.batchId,
              childThreadId: child.threadId,
              blockingKind: "approval",
              requestId: blockingRequestId,
            },
          });
          return;
        }
        if (event.payload.activity.kind === "user-input.requested") {
          child.status = "blocked";
          yield* engine.dispatch({
            type: "thread.delegation.child-status.set",
            commandId: CommandId.makeUnsafe(
              `delegation:block:${child.threadId}:${crypto.randomUUID()}`,
            ),
            parentThreadId: batch.parentThreadId,
            batchId: batch.batchId,
            childThreadId: child.threadId,
            status: "blocked",
            blockingRequestId,
            blockingKind: "user-input",
            updatedAt: event.occurredAt,
            createdAt: event.occurredAt,
          });
          yield* mirrorParentActivity({
            parentThreadId: batch.parentThreadId,
            tone: "info",
            kind: "delegation.child-blocked",
            summary: `${child.title}: user input requested`,
            payload: {
              batchId: batch.batchId,
              childThreadId: child.threadId,
              blockingKind: "user-input",
              requestId: blockingRequestId,
            },
          });
          return;
        }
        if (
          event.payload.activity.kind === "approval.resolved" ||
          event.payload.activity.kind === "user-input.resolved"
        ) {
          if (!isTerminalStatus(child.status)) {
            child.status = "running";
            yield* engine.dispatch({
              type: "thread.delegation.child-status.set",
              commandId: CommandId.makeUnsafe(
                `delegation:resume:${child.threadId}:${crypto.randomUUID()}`,
              ),
              parentThreadId: batch.parentThreadId,
              batchId: batch.batchId,
              childThreadId: child.threadId,
              status: "running",
              blockingRequestId: null,
              blockingKind: null,
              updatedAt: event.occurredAt,
              createdAt: event.occurredAt,
            });
          }
        }
      }

      const childThread = readModel.threads.find((thread) => thread.id === child.threadId);
      const latestTurnState = childThread?.latestTurn?.state;
      if (
        childThread &&
        latestTurnState &&
        (latestTurnState === "completed" ||
          latestTurnState === "error" ||
          latestTurnState === "interrupted") &&
        !isTerminalStatus(child.status)
      ) {
        const assistantMessage = childThread.messages
          .toReversed()
          .find((message) => message.role === "assistant" && message.streaming === false);
        const runtimeErrorActivity = childThread.activities
          .toReversed()
          .find((activity) => activity.tone === "error");
        const status = toChildTerminalStatus(latestTurnState);
        const summary =
          assistantMessage?.text?.trim() ||
          asString(asObject(runtimeErrorActivity?.payload)?.message) ||
          latestTurnState;
        child.status = status;
        yield* engine.dispatch({
          type: "thread.delegation.child-result.record",
          commandId: CommandId.makeUnsafe(
            `delegation:result:${child.threadId}:${crypto.randomUUID()}`,
          ),
          parentThreadId: batch.parentThreadId,
          batchId: batch.batchId,
          childThreadId: child.threadId,
          status,
          summary: summary ? truncate(summary) : null,
          error: status === "completed" ? null : truncate(summary ? summary : latestTurnState),
          completedAt: event.occurredAt,
          createdAt: event.occurredAt,
        });
        yield* maybeStartQueuedChildren(batch.batchId);
        yield* completeBatchIfDone(batch.batchId);
      }
    }
  });

  const enqueueDomainEvents = Stream.runForEach(engine.streamDomainEvents, (event) =>
    Queue.offer(queue, { type: "domain", event }),
  );

  const worker = Effect.forever(
    Queue.take(queue).pipe(
      Effect.flatMap((item) => {
        if (item.type === "provider") {
          if (item.event.type === "request.opened") {
            return spawnDelegationBatch(
              item.event as Extract<ProviderRuntimeEvent, { type: "request.opened" }>,
            );
          }
          return Effect.void;
        }
        return maybeHandleChildDomainEvent(item.event);
      }),
    ),
  );

  const start: ThreadDelegationCoordinatorShape["start"] = Effect.gen(function* () {
    yield* markOrphanedRunningBatches;
    yield* Effect.forkScoped(enqueueProviderEvents);
    yield* Effect.forkScoped(enqueueDomainEvents);
    yield* Effect.forkScoped(worker);
  }).pipe(Effect.orDie);

  return {
    start,
  } satisfies ThreadDelegationCoordinatorShape;
});

export const ThreadDelegationCoordinatorLive = Layer.effect(
  ThreadDelegationCoordinator,
  makeThreadDelegationCoordinator,
);
