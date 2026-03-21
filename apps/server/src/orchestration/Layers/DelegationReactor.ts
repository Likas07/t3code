import {
  CommandId,
  EventId,
  type OrchestrationEvent,
  type TaskId,
  ThreadId,
} from "@t3tools/contracts";
import { Cause, Effect, Layer, Stream } from "effect";
import { makeDrainableWorker } from "@t3tools/shared/DrainableWorker";

import { OrchestrationEngineService } from "../Services/OrchestrationEngine.ts";
import {
  DelegationReactor,
  type DelegationReactorShape,
} from "../Services/DelegationReactor.ts";

type TurnCompletedEvent = Extract<
  OrchestrationEvent,
  { type: "thread.turn-completed" }
>;

type ActivityAppendedEvent = Extract<
  OrchestrationEvent,
  { type: "thread.activity-appended" }
>;

const serverCommandId = (tag: string): CommandId =>
  CommandId.makeUnsafe(`server:${tag}:${crypto.randomUUID()}`);

const make = Effect.gen(function* () {
  const orchestrationEngine = yield* OrchestrationEngineService;

  const processTurnCompleted = Effect.fnUntraced(function* (
    event: TurnCompletedEvent,
  ) {
    const readModel = yield* orchestrationEngine.getReadModel();
    const thread = readModel.threads.find(
      (entry) => entry.id === event.payload.threadId,
    );
    if (!thread?.delegation) {
      return;
    }

    // Find the task associated with this child thread
    const parentThread = readModel.threads.find(
      (entry) => entry.id === thread.delegation!.parentThreadId,
    );
    if (!parentThread) {
      return;
    }

    const task = parentThread.delegationTasks.find(
      (t) => t.childThreadId === thread.id,
    );
    if (!task) {
      return;
    }

    // Skip if the task is already completed
    if (task.status === "completed" || task.status === "deleted") {
      return;
    }

    // Get the last assistant message as summary
    const lastAssistantMessage = thread.messages
      .filter((msg) => msg.role === "assistant")
      .at(-1);
    const summary = lastAssistantMessage?.text ?? undefined;

    const result = event.payload.result;

    yield* orchestrationEngine.dispatch({
      type: "delegation.child.complete",
      commandId: serverCommandId("delegation-child-complete"),
      childThreadId: thread.id,
      taskId: task.id,
      result,
      ...(summary !== undefined ? { summary } : {}),
      createdAt: event.occurredAt,
    });

    // Append activity to parent thread for UI context
    yield* orchestrationEngine.dispatch({
      type: "thread.activity.append",
      commandId: serverCommandId("delegation-child-activity"),
      threadId: thread.delegation.parentThreadId,
      activity: {
        id: EventId.makeUnsafe(crypto.randomUUID()),
        tone: "info",
        kind: "delegation.child.completed",
        summary: `Child thread "${thread.title}" ${result}`,
        payload: {
          childThreadId: thread.id,
          taskId: task.id,
          result,
        },
        turnId: null,
        createdAt: event.occurredAt,
      },
      createdAt: event.occurredAt,
    });
  });

  const processActivityAppended = Effect.fnUntraced(function* (
    event: ActivityAppendedEvent,
  ) {
    const activity = event.payload.activity;
    if (activity.kind !== "approval.requested") {
      return;
    }

    const readModel = yield* orchestrationEngine.getReadModel();
    const thread = readModel.threads.find(
      (entry) => entry.id === event.payload.threadId,
    );
    if (!thread?.delegation) {
      return;
    }

    const parentThread = readModel.threads.find(
      (entry) => entry.id === thread.delegation!.parentThreadId,
    );
    if (!parentThread) {
      return;
    }

    yield* orchestrationEngine.dispatch({
      type: "thread.activity.append",
      commandId: serverCommandId("delegation-child-approval-needed"),
      threadId: thread.delegation.parentThreadId,
      activity: {
        id: EventId.makeUnsafe(crypto.randomUUID()),
        tone: "approval",
        kind: "delegation.child.approval-needed",
        summary: `Child thread "${thread.title}" needs approval`,
        payload: {
          childThreadId: thread.id,
          parentThreadId: thread.delegation.parentThreadId,
        },
        turnId: null,
        createdAt: event.occurredAt,
      },
      createdAt: event.occurredAt,
    });
  });

  const processDomainEventSafely = (event: TurnCompletedEvent | ActivityAppendedEvent) =>
    (event.type === "thread.activity-appended"
      ? processActivityAppended(event)
      : processTurnCompleted(event)
    ).pipe(
      Effect.catchCause((cause) => {
        if (Cause.hasInterruptsOnly(cause)) {
          return Effect.failCause(cause);
        }
        return Effect.logWarning(
          "delegation reactor failed to process event",
          {
            eventType: event.type,
            cause: Cause.pretty(cause),
          },
        );
      }),
    );

  const worker = yield* makeDrainableWorker(processDomainEventSafely);

  const start: DelegationReactorShape["start"] = Effect.forkScoped(
    Stream.runForEach(orchestrationEngine.streamDomainEvents, (event) => {
      if (
        event.type !== "thread.turn-completed" &&
        event.type !== "thread.activity-appended"
      ) {
        return Effect.void;
      }
      return worker.enqueue(event);
    }),
  ).pipe(Effect.asVoid);

  return {
    start,
    drain: worker.drain,
  } satisfies DelegationReactorShape;
});

export const DelegationReactorLive = Layer.effect(DelegationReactor, make);
