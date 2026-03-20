import {
  AgentId,
  CommandId,
  DelegationBatchId,
  DEFAULT_PROVIDER_INTERACTION_MODE,
  EventId,
  ProjectId,
  TaskId,
  ThreadId,
  type OrchestrationEvent,
} from "@t3tools/contracts";
import { describe, expect, it } from "vitest";
import { Effect } from "effect";

import { decideOrchestrationCommand } from "./decider.ts";
import { createEmptyReadModel, projectEvent } from "./projector.ts";

const asEventId = (value: string): EventId => EventId.makeUnsafe(value);
const asProjectId = (value: string): ProjectId => ProjectId.makeUnsafe(value);
const asThreadId = (value: string): ThreadId => ThreadId.makeUnsafe(value);
const asTaskId = (value: string): TaskId => TaskId.makeUnsafe(value);
const asAgentId = (value: string): AgentId => AgentId.makeUnsafe(value);
const asDelegationBatchId = (value: string): DelegationBatchId =>
  DelegationBatchId.makeUnsafe(value);

function makeEvent(input: {
  sequence: number;
  type: OrchestrationEvent["type"];
  occurredAt: string;
  aggregateKind: OrchestrationEvent["aggregateKind"];
  aggregateId: string;
  commandId: string | null;
  payload: unknown;
}): OrchestrationEvent {
  return {
    sequence: input.sequence,
    eventId: EventId.makeUnsafe(`event-${input.sequence}`),
    type: input.type,
    aggregateKind: input.aggregateKind,
    aggregateId:
      input.aggregateKind === "project"
        ? ProjectId.makeUnsafe(input.aggregateId)
        : ThreadId.makeUnsafe(input.aggregateId),
    occurredAt: input.occurredAt,
    commandId: input.commandId === null ? null : CommandId.makeUnsafe(input.commandId),
    causationEventId: null,
    correlationId: null,
    metadata: {},
    payload: input.payload as never,
  } as OrchestrationEvent;
}

async function setupProjectAndThread(now: string) {
  const initial = createEmptyReadModel(now);
  const withProject = await Effect.runPromise(
    projectEvent(initial, {
      sequence: 1,
      eventId: asEventId("evt-project-create"),
      aggregateKind: "project",
      aggregateId: asProjectId("project-1"),
      type: "project.created",
      occurredAt: now,
      commandId: CommandId.makeUnsafe("cmd-project-create"),
      causationEventId: null,
      correlationId: CommandId.makeUnsafe("cmd-project-create"),
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
      eventId: asEventId("evt-thread-create"),
      aggregateKind: "thread",
      aggregateId: asThreadId("parent-thread"),
      type: "thread.created",
      occurredAt: now,
      commandId: CommandId.makeUnsafe("cmd-thread-create"),
      causationEventId: null,
      correlationId: CommandId.makeUnsafe("cmd-thread-create"),
      metadata: {},
      payload: {
        threadId: asThreadId("parent-thread"),
        projectId: asProjectId("project-1"),
        title: "Parent Thread",
        model: "gpt-5-codex",
        interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
        runtimeMode: "full-access",
        agentId: null,
        delegation: null,
        branch: null,
        worktreePath: null,
        createdAt: now,
        updatedAt: now,
      },
    }),
  );
  return readModel;
}

describe("decider delegation", () => {
  it("delegation.batch.start creates correct events with lineage", async () => {
    const now = new Date().toISOString();
    const readModel = await setupProjectAndThread(now);

    const result = await Effect.runPromise(
      decideOrchestrationCommand({
        command: {
          type: "delegation.batch.start",
          commandId: CommandId.makeUnsafe("cmd-batch-start"),
          threadId: asThreadId("parent-thread"),
          delegationId: asDelegationBatchId("batch-1"),
          children: [
            {
              childThreadId: asThreadId("child-thread-1"),
              taskId: asTaskId("task-1"),
              agentId: asAgentId("agent-1"),
              subject: "Implement feature A",
              description: "Full description of feature A",
            },
            {
              childThreadId: asThreadId("child-thread-2"),
              taskId: asTaskId("task-2"),
              agentId: asAgentId("agent-2"),
              subject: "Implement feature B",
              description: "Full description of feature B",
            },
          ],
          createdAt: now,
        },
        readModel,
      }),
    );

    expect(Array.isArray(result)).toBe(true);
    const events = Array.isArray(result) ? result : [result];
    // 1 batch-started + 2 thread.created
    expect(events).toHaveLength(3);

    expect(events[0]?.type).toBe("delegation.batch-started");
    expect(events[0]?.payload).toMatchObject({
      threadId: asThreadId("parent-thread"),
      delegationId: asDelegationBatchId("batch-1"),
    });

    expect(events[1]?.type).toBe("thread.created");
    const child1Payload = events[1]?.payload as {
      threadId: string;
      delegation: { parentThreadId: string; rootThreadId: string; depth: number };
    };
    expect(child1Payload.threadId).toBe("child-thread-1");
    expect(child1Payload.delegation).toEqual({
      parentThreadId: "parent-thread",
      rootThreadId: "parent-thread",
      depth: 1,
    });

    expect(events[2]?.type).toBe("thread.created");
    const child2Payload = events[2]?.payload as {
      threadId: string;
      delegation: { parentThreadId: string; rootThreadId: string; depth: number };
    };
    expect(child2Payload.threadId).toBe("child-thread-2");
    expect(child2Payload.delegation).toEqual({
      parentThreadId: "parent-thread",
      rootThreadId: "parent-thread",
      depth: 1,
    });
  });

  it("delegation.batch.start at max depth rejects", async () => {
    const now = new Date().toISOString();
    const initial = createEmptyReadModel(now);

    // Create project
    const withProject = await Effect.runPromise(
      projectEvent(initial, {
        sequence: 1,
        eventId: asEventId("evt-project-create"),
        aggregateKind: "project",
        aggregateId: asProjectId("project-1"),
        type: "project.created",
        occurredAt: now,
        commandId: CommandId.makeUnsafe("cmd-project-create"),
        causationEventId: null,
        correlationId: CommandId.makeUnsafe("cmd-project-create"),
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

    // Create a thread that already has delegation at depth 1 (maxDepth is 2, so child would be depth 2 which >= maxDepth)
    const readModel = await Effect.runPromise(
      projectEvent(
        withProject,
        makeEvent({
          sequence: 2,
          type: "thread.created",
          aggregateKind: "thread",
          aggregateId: "deep-thread",
          occurredAt: now,
          commandId: "cmd-deep-thread-create",
          payload: {
            threadId: "deep-thread",
            projectId: "project-1",
            title: "Deep Thread",
            model: "gpt-5-codex",
            runtimeMode: "full-access",
            agentId: null,
            branch: null,
            worktreePath: null,
            delegation: {
              parentThreadId: "parent-thread",
              rootThreadId: "root-thread",
              depth: 1,
            },
            createdAt: now,
            updatedAt: now,
          },
        }),
      ),
    );

    await expect(
      Effect.runPromise(
        decideOrchestrationCommand({
          command: {
            type: "delegation.batch.start",
            commandId: CommandId.makeUnsafe("cmd-batch-deep"),
            threadId: asThreadId("deep-thread"),
            delegationId: asDelegationBatchId("batch-deep"),
            children: [
              {
                childThreadId: asThreadId("too-deep-child"),
                taskId: asTaskId("task-deep"),
                agentId: asAgentId("agent-deep"),
                subject: "Too deep",
                description: "Should fail",
              },
            ],
            createdAt: now,
          },
          readModel,
        }),
      ),
    ).rejects.toBeDefined();
  });

  it("task.create adds task", async () => {
    const now = new Date().toISOString();
    const readModel = await setupProjectAndThread(now);

    const result = await Effect.runPromise(
      decideOrchestrationCommand({
        command: {
          type: "task.create",
          commandId: CommandId.makeUnsafe("cmd-task-create"),
          threadId: asThreadId("parent-thread"),
          task: {
            id: asTaskId("task-1"),
            subject: "Build the widget",
            description: "Detailed description",
            status: "pending",
            blockedBy: [],
            blocks: [],
            owner: asAgentId("agent-1"),
          },
          createdAt: now,
        },
        readModel,
      }),
    );

    const event = Array.isArray(result) ? result[0] : result;
    expect(event?.type).toBe("task.created");
    expect(event?.payload).toMatchObject({
      threadId: asThreadId("parent-thread"),
      task: {
        id: asTaskId("task-1"),
        subject: "Build the widget",
        status: "pending",
      },
    });
  });

  it("task.update changes status", async () => {
    const now = new Date().toISOString();
    const readModel = await setupProjectAndThread(now);

    // First create a task via projector so the thread has delegationTasks
    const withTask = await Effect.runPromise(
      projectEvent(
        readModel,
        makeEvent({
          sequence: 3,
          type: "task.created",
          aggregateKind: "task",
          aggregateId: "parent-thread",
          occurredAt: now,
          commandId: "cmd-task-create",
          payload: {
            threadId: "parent-thread",
            task: {
              id: "task-1",
              threadId: "parent-thread",
              subject: "Build the widget",
              status: "pending",
              blockedBy: [],
              blocks: [],
              createdAt: now,
              updatedAt: now,
            },
            createdAt: now,
          },
        }),
      ),
    );

    const result = await Effect.runPromise(
      decideOrchestrationCommand({
        command: {
          type: "task.update",
          commandId: CommandId.makeUnsafe("cmd-task-update"),
          threadId: asThreadId("parent-thread"),
          taskId: asTaskId("task-1"),
          status: "in_progress",
          createdAt: now,
        },
        readModel: withTask,
      }),
    );

    const event = Array.isArray(result) ? result[0] : result;
    expect(event?.type).toBe("task.updated");
    expect(event?.payload).toMatchObject({
      threadId: asThreadId("parent-thread"),
      taskId: asTaskId("task-1"),
      status: "in_progress",
    });
  });

  it("task.update rejects when task does not exist", async () => {
    const now = new Date().toISOString();
    const readModel = await setupProjectAndThread(now);

    await expect(
      Effect.runPromise(
        decideOrchestrationCommand({
          command: {
            type: "task.update",
            commandId: CommandId.makeUnsafe("cmd-task-update-missing"),
            threadId: asThreadId("parent-thread"),
            taskId: asTaskId("nonexistent-task"),
            status: "completed",
            createdAt: now,
          },
          readModel,
        }),
      ),
    ).rejects.toBeDefined();
  });

  it("delegation.child.complete updates parent task", async () => {
    const now = new Date().toISOString();
    const readModel = await setupProjectAndThread(now);

    // Add a task to parent thread
    const withTask = await Effect.runPromise(
      projectEvent(
        readModel,
        makeEvent({
          sequence: 3,
          type: "task.created",
          aggregateKind: "task",
          aggregateId: "parent-thread",
          occurredAt: now,
          commandId: "cmd-task-create",
          payload: {
            threadId: "parent-thread",
            task: {
              id: "task-child-1",
              threadId: "parent-thread",
              subject: "Delegated task",
              status: "in_progress",
              blockedBy: [],
              blocks: [],
              createdAt: now,
              updatedAt: now,
            },
            createdAt: now,
          },
        }),
      ),
    );

    // Create a child thread with delegation lineage
    const withChild = await Effect.runPromise(
      projectEvent(
        withTask,
        makeEvent({
          sequence: 4,
          type: "thread.created",
          aggregateKind: "thread",
          aggregateId: "child-thread-1",
          occurredAt: now,
          commandId: "cmd-child-create",
          payload: {
            threadId: "child-thread-1",
            projectId: "project-1",
            title: "Child Thread",
            model: "gpt-5-codex",
            runtimeMode: "full-access",
            agentId: null,
            branch: null,
            worktreePath: null,
            delegation: {
              parentThreadId: "parent-thread",
              rootThreadId: "parent-thread",
              depth: 1,
            },
            createdAt: now,
            updatedAt: now,
          },
        }),
      ),
    );

    const result = await Effect.runPromise(
      decideOrchestrationCommand({
        command: {
          type: "delegation.child.complete",
          commandId: CommandId.makeUnsafe("cmd-child-complete"),
          childThreadId: asThreadId("child-thread-1"),
          taskId: asTaskId("task-child-1"),
          result: "completed",
          summary: "All done",
          createdAt: now,
        },
        readModel: withChild,
      }),
    );

    expect(Array.isArray(result)).toBe(true);
    const events = Array.isArray(result) ? result : [result];
    expect(events).toHaveLength(2);

    expect(events[0]?.type).toBe("delegation.child-completed");
    expect(events[0]?.payload).toMatchObject({
      childThreadId: asThreadId("child-thread-1"),
      taskId: asTaskId("task-child-1"),
      parentThreadId: asThreadId("parent-thread"),
      result: "completed",
      summary: "All done",
    });

    expect(events[1]?.type).toBe("task.updated");
    expect(events[1]?.payload).toMatchObject({
      threadId: asThreadId("parent-thread"),
      taskId: asTaskId("task-child-1"),
      status: "completed",
    });
  });
});

describe("projector delegation", () => {
  it("delegation.batch-started is a no-op", async () => {
    const now = new Date().toISOString();
    const model = createEmptyReadModel(now);

    const next = await Effect.runPromise(
      projectEvent(
        model,
        makeEvent({
          sequence: 1,
          type: "delegation.batch-started",
          aggregateKind: "delegation",
          aggregateId: "parent-thread",
          occurredAt: now,
          commandId: "cmd-batch",
          payload: {
            threadId: "parent-thread",
            delegationId: "batch-1",
            children: [],
            createdAt: now,
          },
        }),
      ),
    );

    expect(next.snapshotSequence).toBe(1);
    expect(next.threads).toEqual([]);
  });

  it("task.created adds task to thread delegationTasks", async () => {
    const now = new Date().toISOString();
    const model = createEmptyReadModel(now);

    const afterCreate = await Effect.runPromise(
      projectEvent(
        model,
        makeEvent({
          sequence: 1,
          type: "thread.created",
          aggregateKind: "thread",
          aggregateId: "thread-1",
          occurredAt: now,
          commandId: "cmd-create",
          payload: {
            threadId: "thread-1",
            projectId: "project-1",
            title: "demo",
            model: "gpt-5-codex",
            runtimeMode: "full-access",
            branch: null,
            worktreePath: null,
            createdAt: now,
            updatedAt: now,
          },
        }),
      ),
    );

    const afterTask = await Effect.runPromise(
      projectEvent(
        afterCreate,
        makeEvent({
          sequence: 2,
          type: "task.created",
          aggregateKind: "task",
          aggregateId: "thread-1",
          occurredAt: now,
          commandId: "cmd-task-create",
          payload: {
            threadId: "thread-1",
            task: {
              id: "task-1",
              threadId: "thread-1",
              subject: "Build widget",
              status: "pending",
              blockedBy: [],
              blocks: [],
              createdAt: now,
              updatedAt: now,
            },
            createdAt: now,
          },
        }),
      ),
    );

    const thread = afterTask.threads[0];
    expect(thread?.delegationTasks).toHaveLength(1);
    expect(thread?.delegationTasks[0]?.id).toBe("task-1");
    expect(thread?.delegationTasks[0]?.subject).toBe("Build widget");
    expect(thread?.delegationTasks[0]?.status).toBe("pending");
  });

  it("task.updated changes task status in thread", async () => {
    const now = new Date().toISOString();
    const model = createEmptyReadModel(now);

    const afterCreate = await Effect.runPromise(
      projectEvent(
        model,
        makeEvent({
          sequence: 1,
          type: "thread.created",
          aggregateKind: "thread",
          aggregateId: "thread-1",
          occurredAt: now,
          commandId: "cmd-create",
          payload: {
            threadId: "thread-1",
            projectId: "project-1",
            title: "demo",
            model: "gpt-5-codex",
            runtimeMode: "full-access",
            branch: null,
            worktreePath: null,
            createdAt: now,
            updatedAt: now,
          },
        }),
      ),
    );

    const afterTask = await Effect.runPromise(
      projectEvent(
        afterCreate,
        makeEvent({
          sequence: 2,
          type: "task.created",
          aggregateKind: "task",
          aggregateId: "thread-1",
          occurredAt: now,
          commandId: "cmd-task-create",
          payload: {
            threadId: "thread-1",
            task: {
              id: "task-1",
              threadId: "thread-1",
              subject: "Build widget",
              status: "pending",
              blockedBy: [],
              blocks: [],
              createdAt: now,
              updatedAt: now,
            },
            createdAt: now,
          },
        }),
      ),
    );

    const updatedAt = new Date(Date.now() + 1000).toISOString();
    const afterUpdate = await Effect.runPromise(
      projectEvent(
        afterTask,
        makeEvent({
          sequence: 3,
          type: "task.updated",
          aggregateKind: "task",
          aggregateId: "thread-1",
          occurredAt: updatedAt,
          commandId: "cmd-task-update",
          payload: {
            threadId: "thread-1",
            taskId: "task-1",
            status: "completed",
            summary: "Done",
            updatedAt,
          },
        }),
      ),
    );

    const thread = afterUpdate.threads[0];
    expect(thread?.delegationTasks[0]?.status).toBe("completed");
    expect(thread?.delegationTasks[0]?.summary).toBe("Done");
  });

  it("task.dependency-added updates blockedBy and blocks", async () => {
    const now = new Date().toISOString();
    const model = createEmptyReadModel(now);

    const afterCreate = await Effect.runPromise(
      projectEvent(
        model,
        makeEvent({
          sequence: 1,
          type: "thread.created",
          aggregateKind: "thread",
          aggregateId: "thread-1",
          occurredAt: now,
          commandId: "cmd-create",
          payload: {
            threadId: "thread-1",
            projectId: "project-1",
            title: "demo",
            model: "gpt-5-codex",
            runtimeMode: "full-access",
            branch: null,
            worktreePath: null,
            createdAt: now,
            updatedAt: now,
          },
        }),
      ),
    );

    // Create two tasks
    let state = afterCreate;
    for (const [idx, taskId] of (["task-a", "task-b"] as const).entries()) {
      state = await Effect.runPromise(
        projectEvent(
          state,
          makeEvent({
            sequence: idx + 2,
            type: "task.created",
            aggregateKind: "task",
            aggregateId: "thread-1",
            occurredAt: now,
            commandId: `cmd-task-create-${taskId}`,
            payload: {
              threadId: "thread-1",
              task: {
                id: taskId,
                threadId: "thread-1",
                subject: `Task ${taskId}`,
                status: "pending",
                blockedBy: [],
                blocks: [],
                createdAt: now,
                updatedAt: now,
              },
              createdAt: now,
            },
          }),
        ),
      );
    }

    const depAt = new Date(Date.now() + 1000).toISOString();
    const afterDep = await Effect.runPromise(
      projectEvent(
        state,
        makeEvent({
          sequence: 4,
          type: "task.dependency-added",
          aggregateKind: "task",
          aggregateId: "thread-1",
          occurredAt: depAt,
          commandId: "cmd-dep-add",
          payload: {
            threadId: "thread-1",
            taskId: "task-a",
            blockedByTaskId: "task-b",
            updatedAt: depAt,
          },
        }),
      ),
    );

    const thread = afterDep.threads[0];
    const taskA = thread?.delegationTasks.find((t) => t.id === "task-a");
    const taskB = thread?.delegationTasks.find((t) => t.id === "task-b");
    expect(taskA?.blockedBy).toEqual(["task-b"]);
    expect(taskB?.blocks).toEqual(["task-a"]);
  });

  it("thread.created with delegation sets lineage on thread", async () => {
    const now = new Date().toISOString();
    const model = createEmptyReadModel(now);

    const next = await Effect.runPromise(
      projectEvent(
        model,
        makeEvent({
          sequence: 1,
          type: "thread.created",
          aggregateKind: "thread",
          aggregateId: "child-thread",
          occurredAt: now,
          commandId: "cmd-child-create",
          payload: {
            threadId: "child-thread",
            projectId: "project-1",
            title: "Child",
            model: "gpt-5-codex",
            runtimeMode: "full-access",
            agentId: null,
            branch: null,
            worktreePath: null,
            delegation: {
              parentThreadId: "parent-thread",
              rootThreadId: "root-thread",
              depth: 1,
            },
            createdAt: now,
            updatedAt: now,
          },
        }),
      ),
    );

    const thread = next.threads[0];
    expect(thread?.delegation).toEqual({
      parentThreadId: "parent-thread",
      rootThreadId: "root-thread",
      depth: 1,
    });
  });
});
