import { CommandId, EventId, MessageId, ProjectId, ThreadId } from "@t3tools/contracts";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { decideOrchestrationCommand } from "./decider.ts";
import { createEmptyReadModel, projectEvent } from "./projector.ts";

const asEventId = (value: string): EventId => EventId.makeUnsafe(value);
const asMessageId = (value: string): MessageId => MessageId.makeUnsafe(value);
const asProjectId = (value: string): ProjectId => ProjectId.makeUnsafe(value);
const asThreadId = (value: string): ThreadId => ThreadId.makeUnsafe(value);

describe("decider thread fork", () => {
  it("emits thread.created plus imported message events for a materialized semantic fork", async () => {
    const now = "2026-03-01T00:00:00.000Z";
    const initial = createEmptyReadModel(now);
    const withProject = await Effect.runPromise(
      projectEvent(initial, {
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
      }),
    );
    const readModel = await Effect.runPromise(
      projectEvent(withProject, {
        sequence: 2,
        eventId: asEventId("evt-thread"),
        aggregateKind: "thread",
        aggregateId: asThreadId("thread-source"),
        type: "thread.created",
        occurredAt: now,
        commandId: CommandId.makeUnsafe("cmd-thread"),
        causationEventId: null,
        correlationId: CommandId.makeUnsafe("cmd-thread"),
        metadata: {},
        payload: {
          threadId: asThreadId("thread-source"),
          projectId: asProjectId("project-1"),
          title: "Source",
          model: "gpt-5-codex",
          runtimeMode: "full-access",
          interactionMode: "default",
          branch: "feature/source",
          worktreePath: "/tmp/project/.worktree",
          fork: null,
          lineage: {
            rootThreadId: asThreadId("thread-source"),
            parentThreadId: null,
            delegationDepth: 0,
            role: "primary",
            parentBatchId: null,
            parentTaskIndex: null,
          },
          createdAt: now,
          updatedAt: now,
        },
      }),
    );

    const result = await Effect.runPromise(
      decideOrchestrationCommand({
        command: {
          type: "thread.fork.semantic.materialized",
          commandId: CommandId.makeUnsafe("cmd-fork"),
          sourceThreadId: asThreadId("thread-source"),
          threadId: asThreadId("thread-fork"),
          projectId: asProjectId("project-1"),
          title: "Source (fork)",
          model: "gpt-5-codex",
          runtimeMode: "full-access",
          interactionMode: "default",
          branch: "feature/source",
          worktreePath: "/tmp/project/.worktree",
          messages: [
            {
              messageId: asMessageId("msg-user-fork"),
              role: "user",
              text: "hello",
              attachments: [],
              createdAt: now,
              updatedAt: now,
            },
            {
              messageId: asMessageId("msg-assistant-fork"),
              role: "assistant",
              text: "world",
              attachments: [],
              createdAt: now,
              updatedAt: now,
            },
          ],
          createdAt: now,
        },
        readModel,
      }),
    );

    expect(Array.isArray(result)).toBe(true);
    const events = Array.isArray(result) ? result : [result];
    expect(events[0]?.type).toBe("thread.created");
    expect(events[1]?.type).toBe("thread.message-sent");
    expect(events[2]?.type).toBe("thread.message-sent");
    if (events[0]?.type === "thread.created") {
      expect(events[0].payload.fork).toEqual({
        kind: "semantic",
        sourceThreadId: asThreadId("thread-source"),
        bootstrapStatus: "pending",
        importedMessageCount: 2,
        createdAt: now,
        bootstrappedAt: null,
      });
    }
    if (events[1]?.type === "thread.message-sent") {
      expect(events[1].payload.origin).toBe("fork-import");
      expect(events[1].payload.turnId).toBeNull();
    }
  });
});
