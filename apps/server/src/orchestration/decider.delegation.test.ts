import {
  CommandId,
  EventId,
  MessageId,
  ProjectId,
  ThreadId,
  type OrchestrationEvent,
} from "@t3tools/contracts";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { decideOrchestrationCommand } from "./decider.ts";
import { createEmptyReadModel, projectEvent } from "./projector.ts";

const asEventId = (value: string): EventId => EventId.makeUnsafe(value);
const asMessageId = (value: string): MessageId => MessageId.makeUnsafe(value);
const asProjectId = (value: string): ProjectId => ProjectId.makeUnsafe(value);
const asThreadId = (value: string): ThreadId => ThreadId.makeUnsafe(value);

function makeProjectCreatedEvent(now: string): OrchestrationEvent {
  return {
    sequence: 1,
    eventId: asEventId("evt-project"),
    aggregateKind: "project",
    aggregateId: asProjectId("project-1"),
    type: "project.created",
    occurredAt: now,
    commandId: CommandId.makeUnsafe("cmd-project"),
    causationEventId: null,
    correlationId: CommandId.makeUnsafe("cmd-project"),
    metadata: {},
    payload: {
      projectId: asProjectId("project-1"),
      title: "Project",
      workspaceRoot: "/tmp/project",
      defaultModel: null,
      scripts: [],
      createdAt: now,
      updatedAt: now,
    },
  };
}

function makeParentThreadCreatedEvent(now: string): OrchestrationEvent {
  return {
    sequence: 2,
    eventId: asEventId("evt-parent-thread"),
    aggregateKind: "thread",
    aggregateId: asThreadId("thread-parent"),
    type: "thread.created",
    occurredAt: now,
    commandId: CommandId.makeUnsafe("cmd-parent-thread"),
    causationEventId: null,
    correlationId: CommandId.makeUnsafe("cmd-parent-thread"),
    metadata: {},
        payload: {
          threadId: asThreadId("thread-parent"),
          projectId: asProjectId("project-1"),
          title: "Parent",
          model: "gpt-5-codex",
      runtimeMode: "full-access",
      interactionMode: "default",
          branch: "feature/parent",
          worktreePath: "/tmp/project/.worktree-parent",
          fork: null,
          lineage: {
            rootThreadId: asThreadId("thread-parent"),
            parentThreadId: null,
            delegationDepth: 0,
            role: "primary",
            parentBatchId: null,
            parentTaskIndex: null,
          },
          createdAt: now,
          updatedAt: now,
        },
  };
}

describe("decider delegation", () => {
  it("emits parent delegation events and child thread creation for a materialized batch", async () => {
    const now = "2026-03-12T00:00:00.000Z";
    const initial = createEmptyReadModel(now);
    const withProject = await Effect.runPromise(projectEvent(initial, makeProjectCreatedEvent(now)));
    const readModel = await Effect.runPromise(
      projectEvent(withProject, makeParentThreadCreatedEvent(now)),
    );

    const result = await Effect.runPromise(
      decideOrchestrationCommand({
        command: {
          type: "thread.delegation.spawn.materialized",
          commandId: CommandId.makeUnsafe("cmd-delegation"),
          parentThreadId: asThreadId("thread-parent"),
          batchId: "batch-1",
          parentTurnId: null,
          workspaceMode: "same-worktree",
          concurrencyLimit: 2,
          children: [
            {
              threadId: asThreadId("thread-child-1"),
              title: "Task 1",
              prompt: "Implement task 1",
              model: "gpt-5-codex",
              runtimeMode: "full-access",
              interactionMode: "default",
              branch: "feature/parent",
              worktreePath: "/tmp/project/.worktree-parent",
              forkSourceThreadId: asThreadId("thread-parent"),
              createdAt: now,
              messages: [
                {
                  messageId: asMessageId("msg-child-imported"),
                  role: "assistant",
                  text: "Imported context",
                  attachments: [],
                  createdAt: now,
                  updatedAt: now,
                },
              ],
            },
          ],
          createdAt: now,
        },
        readModel,
      }),
    );

    expect(Array.isArray(result)).toBe(true);
    const events = Array.isArray(result) ? result : [result];
    expect(events.map((event) => event.type)).toEqual([
      "thread.delegation-batch-created",
      "thread.created",
      "thread.delegation-child-linked",
      "thread.message-sent",
    ]);

    const batchCreated = events[0];
    expect(batchCreated?.type).toBe("thread.delegation-batch-created");
    if (batchCreated?.type === "thread.delegation-batch-created") {
      expect(batchCreated.payload.batchId).toBe("batch-1");
      expect(batchCreated.payload.parentThreadId).toBe("thread-parent");
      expect(batchCreated.payload.status).toBe("running");
      expect(batchCreated.payload.concurrencyLimit).toBe(2);
    }

    const childCreated = events[1];
    expect(childCreated?.type).toBe("thread.created");
    if (childCreated?.type === "thread.created") {
      expect(childCreated.payload.lineage).toEqual({
        rootThreadId: asThreadId("thread-parent"),
        parentThreadId: asThreadId("thread-parent"),
        delegationDepth: 1,
        role: "child",
        parentBatchId: "batch-1",
        parentTaskIndex: 0,
      });
      expect(childCreated.payload.fork?.sourceThreadId).toBe("thread-parent");
    }
  });
});
