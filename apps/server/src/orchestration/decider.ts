import type {
  OrchestrationCommand,
  OrchestrationEvent,
  OrchestrationReadModel,
} from "@t3tools/contracts";
import { Effect } from "effect";

import { OrchestrationCommandInvariantError } from "./Errors.ts";
import {
  requireProject,
  requireProjectAbsent,
  requireThread,
  requireThreadAbsent,
} from "./commandInvariants.ts";

const nowIso = () => new Date().toISOString();
const DEFAULT_ASSISTANT_DELIVERY_MODE = "buffered" as const;

const defaultMetadata: Omit<OrchestrationEvent, "sequence" | "type" | "payload"> = {
  eventId: crypto.randomUUID() as OrchestrationEvent["eventId"],
  aggregateKind: "thread",
  aggregateId: "" as OrchestrationEvent["aggregateId"],
  occurredAt: nowIso(),
  commandId: null,
  causationEventId: null,
  correlationId: null,
  metadata: {},
};

function withEventBase(
  input: Pick<OrchestrationCommand, "commandId"> & {
    readonly aggregateKind: OrchestrationEvent["aggregateKind"];
    readonly aggregateId: OrchestrationEvent["aggregateId"];
    readonly occurredAt: string;
    readonly metadata?: OrchestrationEvent["metadata"];
  },
): Omit<OrchestrationEvent, "sequence" | "type" | "payload"> {
  return {
    ...defaultMetadata,
    eventId: crypto.randomUUID() as OrchestrationEvent["eventId"],
    aggregateKind: input.aggregateKind,
    aggregateId: input.aggregateId,
    occurredAt: input.occurredAt,
    commandId: input.commandId,
    correlationId: input.commandId,
    metadata: input.metadata ?? {},
  };
}

export const decideOrchestrationCommand = Effect.fn("decideOrchestrationCommand")(function* ({
  command,
  readModel,
}: {
  readonly command: OrchestrationCommand;
  readonly readModel: OrchestrationReadModel;
}): Effect.fn.Return<
  Omit<OrchestrationEvent, "sequence"> | ReadonlyArray<Omit<OrchestrationEvent, "sequence">>,
  OrchestrationCommandInvariantError
> {
  switch (command.type) {
    case "project.create": {
      yield* requireProjectAbsent({
        readModel,
        command,
        projectId: command.projectId,
      });

      return {
        ...withEventBase({
          aggregateKind: "project",
          aggregateId: command.projectId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        }),
        type: "project.created",
        payload: {
          projectId: command.projectId,
          title: command.title,
          workspaceRoot: command.workspaceRoot,
          defaultModel: command.defaultModel ?? null,
          scripts: [],
          createdAt: command.createdAt,
          updatedAt: command.createdAt,
        },
      };
    }

    case "project.meta.update": {
      yield* requireProject({
        readModel,
        command,
        projectId: command.projectId,
      });
      const occurredAt = nowIso();
      return {
        ...withEventBase({
          aggregateKind: "project",
          aggregateId: command.projectId,
          occurredAt,
          commandId: command.commandId,
        }),
        type: "project.meta-updated",
        payload: {
          projectId: command.projectId,
          ...(command.title !== undefined ? { title: command.title } : {}),
          ...(command.workspaceRoot !== undefined ? { workspaceRoot: command.workspaceRoot } : {}),
          ...(command.defaultModel !== undefined ? { defaultModel: command.defaultModel } : {}),
          ...(command.scripts !== undefined ? { scripts: command.scripts } : {}),
          updatedAt: occurredAt,
        },
      };
    }

    case "project.delete": {
      yield* requireProject({
        readModel,
        command,
        projectId: command.projectId,
      });
      const occurredAt = nowIso();
      return {
        ...withEventBase({
          aggregateKind: "project",
          aggregateId: command.projectId,
          occurredAt,
          commandId: command.commandId,
        }),
        type: "project.deleted",
        payload: {
          projectId: command.projectId,
          deletedAt: occurredAt,
        },
      };
    }

    case "thread.create": {
      yield* requireProject({
        readModel,
        command,
        projectId: command.projectId,
      });
      yield* requireThreadAbsent({
        readModel,
        command,
        threadId: command.threadId,
      });
      return {
        ...withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        }),
        type: "thread.created",
        payload: {
          threadId: command.threadId,
          projectId: command.projectId,
          title: command.title,
          model: command.model,
          runtimeMode: command.runtimeMode,
          interactionMode: command.interactionMode,
          branch: command.branch,
          worktreePath: command.worktreePath,
          fork: null,
          lineage: {
            rootThreadId: command.threadId,
            parentThreadId: null,
            delegationDepth: 0,
            role: "primary",
            parentBatchId: null,
            parentTaskIndex: null,
          },
          createdAt: command.createdAt,
          updatedAt: command.createdAt,
        },
      };
    }

    case "thread.delete": {
      yield* requireThread({
        readModel,
        command,
        threadId: command.threadId,
      });
      const occurredAt = nowIso();
      return {
        ...withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt,
          commandId: command.commandId,
        }),
        type: "thread.deleted",
        payload: {
          threadId: command.threadId,
          deletedAt: occurredAt,
        },
      };
    }

    case "thread.fork.semantic.materialized": {
      yield* requireThread({
        readModel,
        command,
        threadId: command.sourceThreadId,
      });
      yield* requireThreadAbsent({
        readModel,
        command,
        threadId: command.threadId,
      });

      const createdEvent: Omit<OrchestrationEvent, "sequence"> = {
        ...withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        }),
        type: "thread.created",
        payload: {
          threadId: command.threadId,
          projectId: command.projectId,
          title: command.title,
          model: command.model,
          runtimeMode: command.runtimeMode,
          interactionMode: command.interactionMode,
          branch: command.branch,
          worktreePath: command.worktreePath,
          fork: {
            kind: "semantic",
            sourceThreadId: command.sourceThreadId,
            bootstrapStatus: "pending",
            importedMessageCount: command.messages.length,
            createdAt: command.createdAt,
            bootstrappedAt: null,
          },
          lineage: {
            rootThreadId: command.threadId,
            parentThreadId: null,
            delegationDepth: 0,
            role: "primary",
            parentBatchId: null,
            parentTaskIndex: null,
          },
          createdAt: command.createdAt,
          updatedAt: command.createdAt,
        },
      };

      const messageEvents: Array<Omit<OrchestrationEvent, "sequence">> = command.messages.map(
        (message) => ({
          ...withEventBase({
            aggregateKind: "thread",
            aggregateId: command.threadId,
            occurredAt: message.updatedAt,
            commandId: command.commandId,
          }),
          causationEventId: createdEvent.eventId,
          type: "thread.message-sent",
          payload: {
            threadId: command.threadId,
            messageId: message.messageId,
            role: message.role,
            text: message.text,
            attachments: message.attachments,
            turnId: null,
            origin: "fork-import" as const,
            streaming: false,
            createdAt: message.createdAt,
            updatedAt: message.updatedAt,
          },
        }),
      );

      return [createdEvent, ...messageEvents];
    }

    case "thread.delegation.spawn.materialized": {
      yield* requireThread({
        readModel,
        command,
        threadId: command.parentThreadId,
      });
      const parentThread = readModel.threads.find((thread) => thread.id === command.parentThreadId);
      if (!parentThread) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Unknown parent thread: ${command.parentThreadId}`,
        });
      }
      for (const child of command.children) {
        yield* requireThreadAbsent({
          readModel,
          command,
          threadId: child.threadId,
        });
      }

      const batchCreatedEvent: Omit<OrchestrationEvent, "sequence"> = {
        ...withEventBase({
          aggregateKind: "thread",
          aggregateId: command.parentThreadId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        }),
        type: "thread.delegation-batch-created",
        payload: {
          batchId: command.batchId,
          parentThreadId: command.parentThreadId,
          parentTurnId: command.parentTurnId,
          workspaceMode: command.workspaceMode,
          concurrencyLimit: command.concurrencyLimit,
          status: "running",
          createdAt: command.createdAt,
          updatedAt: command.createdAt,
          completedAt: null,
        },
      };

      const childEvents = command.children.flatMap((child, childIndex) => {
        const childCreatedEvent: Omit<OrchestrationEvent, "sequence"> = {
          ...withEventBase({
            aggregateKind: "thread",
            aggregateId: child.threadId,
            occurredAt: child.createdAt,
            commandId: command.commandId,
          }),
          type: "thread.created",
          payload: {
            threadId: child.threadId,
            projectId: parentThread.projectId,
            title: child.title,
            model: child.model,
            runtimeMode: child.runtimeMode,
            interactionMode: child.interactionMode,
            branch: child.branch,
            worktreePath: child.worktreePath,
            fork: {
              kind: "semantic",
              sourceThreadId: child.forkSourceThreadId,
              bootstrapStatus: "pending",
              importedMessageCount: child.messages.length,
              createdAt: child.createdAt,
              bootstrappedAt: null,
            },
            lineage: {
              rootThreadId: command.parentThreadId,
              parentThreadId: command.parentThreadId,
              delegationDepth: 1,
              role: "child",
              parentBatchId: command.batchId,
              parentTaskIndex: childIndex,
            },
            createdAt: child.createdAt,
            updatedAt: child.createdAt,
          },
        };

        const childLinkedEvent: Omit<OrchestrationEvent, "sequence"> = {
          ...withEventBase({
            aggregateKind: "thread",
            aggregateId: command.parentThreadId,
            occurredAt: child.createdAt,
            commandId: command.commandId,
          }),
          causationEventId: batchCreatedEvent.eventId,
          type: "thread.delegation-child-linked",
          payload: {
            batchId: command.batchId,
            parentThreadId: command.parentThreadId,
            child: {
              childThreadId: child.threadId,
              taskIndex: childIndex,
              title: child.title,
              prompt: child.prompt,
              status: "queued",
              branch: child.branch,
              worktreePath: child.worktreePath,
              startedAt: null,
              completedAt: null,
              summary: null,
              error: null,
              blockingRequestId: null,
              blockingKind: null,
            },
          },
        };

        const messageEvents: Array<Omit<OrchestrationEvent, "sequence">> = child.messages.map(
          (message) => ({
            ...withEventBase({
              aggregateKind: "thread",
              aggregateId: child.threadId,
              occurredAt: message.updatedAt,
              commandId: command.commandId,
            }),
            causationEventId: childCreatedEvent.eventId,
            type: "thread.message-sent",
            payload: {
              threadId: child.threadId,
              messageId: message.messageId,
              role: message.role,
              text: message.text,
              attachments: message.attachments,
              turnId: null,
              origin: "fork-import" as const,
              streaming: false,
              createdAt: message.createdAt,
              updatedAt: message.updatedAt,
            },
          }),
        );

        return [childCreatedEvent, childLinkedEvent, ...messageEvents];
      });

      return [batchCreatedEvent, ...childEvents];
    }

    case "thread.fork.semantic": {
      return yield* new OrchestrationCommandInvariantError({
        commandType: command.type,
        detail: "thread.fork.semantic must be normalized before reaching the decider.",
      });
    }

    case "thread.meta.update": {
      yield* requireThread({
        readModel,
        command,
        threadId: command.threadId,
      });
      const occurredAt = nowIso();
      return {
        ...withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt,
          commandId: command.commandId,
        }),
        type: "thread.meta-updated",
        payload: {
          threadId: command.threadId,
          ...(command.title !== undefined ? { title: command.title } : {}),
          ...(command.model !== undefined ? { model: command.model } : {}),
          ...(command.branch !== undefined ? { branch: command.branch } : {}),
          ...(command.worktreePath !== undefined ? { worktreePath: command.worktreePath } : {}),
          updatedAt: occurredAt,
        },
      };
    }

    case "thread.runtime-mode.set": {
      yield* requireThread({
        readModel,
        command,
        threadId: command.threadId,
      });
      const occurredAt = nowIso();
      return {
        ...withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt,
          commandId: command.commandId,
        }),
        type: "thread.runtime-mode-set",
        payload: {
          threadId: command.threadId,
          runtimeMode: command.runtimeMode,
          updatedAt: occurredAt,
        },
      };
    }

    case "thread.interaction-mode.set": {
      yield* requireThread({
        readModel,
        command,
        threadId: command.threadId,
      });
      const occurredAt = nowIso();
      return {
        ...withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt,
          commandId: command.commandId,
        }),
        type: "thread.interaction-mode-set",
        payload: {
          threadId: command.threadId,
          interactionMode: command.interactionMode,
          updatedAt: occurredAt,
        },
      };
    }

    case "thread.turn.start": {
      yield* requireThread({
        readModel,
        command,
        threadId: command.threadId,
      });
      const userMessageEvent: Omit<OrchestrationEvent, "sequence"> = {
        ...withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        }),
        type: "thread.message-sent",
        payload: {
          threadId: command.threadId,
          messageId: command.message.messageId,
          role: "user",
          text: command.message.text,
          attachments: command.message.attachments,
          turnId: null,
          origin: "native",
          streaming: false,
          createdAt: command.createdAt,
          updatedAt: command.createdAt,
        },
      };
      const turnStartRequestedEvent: Omit<OrchestrationEvent, "sequence"> = {
        ...withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        }),
        causationEventId: userMessageEvent.eventId,
        type: "thread.turn-start-requested",
        payload: {
          threadId: command.threadId,
          messageId: command.message.messageId,
          ...(command.provider !== undefined ? { provider: command.provider } : {}),
          ...(command.model !== undefined ? { model: command.model } : {}),
          ...(command.modelOptions !== undefined ? { modelOptions: command.modelOptions } : {}),
          ...(command.providerOptions !== undefined
            ? { providerOptions: command.providerOptions }
            : {}),
          assistantDeliveryMode: command.assistantDeliveryMode ?? DEFAULT_ASSISTANT_DELIVERY_MODE,
          runtimeMode:
            readModel.threads.find((entry) => entry.id === command.threadId)?.runtimeMode ??
            command.runtimeMode,
          interactionMode:
            readModel.threads.find((entry) => entry.id === command.threadId)?.interactionMode ??
            command.interactionMode,
          createdAt: command.createdAt,
        },
      };
      return [userMessageEvent, turnStartRequestedEvent];
    }

    case "thread.turn.interrupt": {
      yield* requireThread({
        readModel,
        command,
        threadId: command.threadId,
      });
      return {
        ...withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        }),
        type: "thread.turn-interrupt-requested",
        payload: {
          threadId: command.threadId,
          ...(command.turnId !== undefined ? { turnId: command.turnId } : {}),
          createdAt: command.createdAt,
        },
      };
    }

    case "thread.approval.respond": {
      yield* requireThread({
        readModel,
        command,
        threadId: command.threadId,
      });
      return {
        ...withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
          metadata: {
            requestId: command.requestId,
          },
        }),
        type: "thread.approval-response-requested",
        payload: {
          threadId: command.threadId,
          requestId: command.requestId,
          decision: command.decision,
          createdAt: command.createdAt,
        },
      };
    }

    case "thread.user-input.respond": {
      yield* requireThread({
        readModel,
        command,
        threadId: command.threadId,
      });
      return {
        ...withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
          metadata: {
            requestId: command.requestId,
          },
        }),
        type: "thread.user-input-response-requested",
        payload: {
          threadId: command.threadId,
          requestId: command.requestId,
          answers: command.answers,
          createdAt: command.createdAt,
        },
      };
    }

    case "thread.checkpoint.revert": {
      yield* requireThread({
        readModel,
        command,
        threadId: command.threadId,
      });
      return {
        ...withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        }),
        type: "thread.checkpoint-revert-requested",
        payload: {
          threadId: command.threadId,
          turnCount: command.turnCount,
          createdAt: command.createdAt,
        },
      };
    }

    case "thread.session.stop": {
      yield* requireThread({
        readModel,
        command,
        threadId: command.threadId,
      });
      return {
        ...withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        }),
        type: "thread.session-stop-requested",
        payload: {
          threadId: command.threadId,
          createdAt: command.createdAt,
        },
      };
    }

    case "thread.session.set": {
      yield* requireThread({
        readModel,
        command,
        threadId: command.threadId,
      });
      return {
        ...withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
          metadata: {},
        }),
        type: "thread.session-set",
        payload: {
          threadId: command.threadId,
          session: command.session,
        },
      };
    }

    case "thread.message.assistant.delta": {
      yield* requireThread({
        readModel,
        command,
        threadId: command.threadId,
      });
      return {
        ...withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        }),
        type: "thread.message-sent",
        payload: {
          threadId: command.threadId,
          messageId: command.messageId,
          role: "assistant",
          text: command.delta,
          turnId: command.turnId ?? null,
          origin: "native",
          streaming: true,
          createdAt: command.createdAt,
          updatedAt: command.createdAt,
        },
      };
    }

    case "thread.message.assistant.complete": {
      yield* requireThread({
        readModel,
        command,
        threadId: command.threadId,
      });
      return {
        ...withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        }),
        type: "thread.message-sent",
        payload: {
          threadId: command.threadId,
          messageId: command.messageId,
          role: "assistant",
          text: "",
          turnId: command.turnId ?? null,
          origin: "native",
          streaming: false,
          createdAt: command.createdAt,
          updatedAt: command.createdAt,
        },
      };
    }

    case "thread.proposed-plan.upsert": {
      yield* requireThread({
        readModel,
        command,
        threadId: command.threadId,
      });
      return {
        ...withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        }),
        type: "thread.proposed-plan-upserted",
        payload: {
          threadId: command.threadId,
          proposedPlan: command.proposedPlan,
        },
      };
    }

    case "thread.turn.diff.complete": {
      yield* requireThread({
        readModel,
        command,
        threadId: command.threadId,
      });
      return {
        ...withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        }),
        type: "thread.turn-diff-completed",
        payload: {
          threadId: command.threadId,
          turnId: command.turnId,
          checkpointTurnCount: command.checkpointTurnCount,
          checkpointRef: command.checkpointRef,
          status: command.status,
          files: command.files,
          assistantMessageId: command.assistantMessageId ?? null,
          completedAt: command.completedAt,
        },
      };
    }

    case "thread.revert.complete": {
      yield* requireThread({
        readModel,
        command,
        threadId: command.threadId,
      });
      return {
        ...withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        }),
        type: "thread.reverted",
        payload: {
          threadId: command.threadId,
          turnCount: command.turnCount,
        },
      };
    }

    case "thread.fork.bootstrap.complete": {
      yield* requireThread({
        readModel,
        command,
        threadId: command.threadId,
      });
      return {
        ...withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        }),
        type: "thread.fork-bootstrap-completed",
        payload: {
          threadId: command.threadId,
          bootstrappedAt: command.bootstrappedAt,
        },
      };
    }

    case "thread.delegation.child-status.set": {
      yield* requireThread({
        readModel,
        command,
        threadId: command.parentThreadId,
      });
      return {
        ...withEventBase({
          aggregateKind: "thread",
          aggregateId: command.parentThreadId,
          occurredAt: command.updatedAt,
          commandId: command.commandId,
        }),
        type: "thread.delegation-child-status-set",
        payload: {
          batchId: command.batchId,
          parentThreadId: command.parentThreadId,
          childThreadId: command.childThreadId,
          status: command.status,
          blockingRequestId: command.blockingRequestId ?? null,
          blockingKind: command.blockingKind ?? null,
          updatedAt: command.updatedAt,
        },
      };
    }

    case "thread.delegation.child-result.record": {
      yield* requireThread({
        readModel,
        command,
        threadId: command.parentThreadId,
      });
      return {
        ...withEventBase({
          aggregateKind: "thread",
          aggregateId: command.parentThreadId,
          occurredAt: command.completedAt,
          commandId: command.commandId,
        }),
        type: "thread.delegation-child-result-recorded",
        payload: {
          batchId: command.batchId,
          parentThreadId: command.parentThreadId,
          childThreadId: command.childThreadId,
          status: command.status,
          summary: command.summary,
          error: command.error ?? null,
          completedAt: command.completedAt,
        },
      };
    }

    case "thread.delegation.batch.complete": {
      yield* requireThread({
        readModel,
        command,
        threadId: command.parentThreadId,
      });
      return {
        ...withEventBase({
          aggregateKind: "thread",
          aggregateId: command.parentThreadId,
          occurredAt: command.completedAt,
          commandId: command.commandId,
        }),
        type: "thread.delegation-batch-completed",
        payload: {
          batchId: command.batchId,
          parentThreadId: command.parentThreadId,
          status: command.status,
          completedAt: command.completedAt,
        },
      };
    }

    case "thread.activity.append": {
      yield* requireThread({
        readModel,
        command,
        threadId: command.threadId,
      });
      const requestId =
        typeof command.activity.payload === "object" &&
        command.activity.payload !== null &&
        "requestId" in command.activity.payload &&
        typeof (command.activity.payload as { requestId?: unknown }).requestId === "string"
          ? ((command.activity.payload as { requestId: string })
              .requestId as OrchestrationEvent["metadata"]["requestId"])
          : undefined;
      return {
        ...withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
          ...(requestId !== undefined ? { metadata: { requestId } } : {}),
        }),
        type: "thread.activity-appended",
        payload: {
          threadId: command.threadId,
          activity: command.activity,
        },
      };
    }

    default: {
      command satisfies never;
      const fallback = command as never as { type: string };
      return yield* new OrchestrationCommandInvariantError({
        commandType: fallback.type,
        detail: `Unknown command type: ${fallback.type}`,
      });
    }
  }
});
