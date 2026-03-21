import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  AgentId,
  CommandId,
  DelegationBatchId,
  DEFAULT_PROVIDER_INTERACTION_MODE,
  MessageId,
  ProjectId,
  TaskId,
  ThreadId,
} from "@t3tools/contracts";
import { Effect, Exit, Layer, ManagedRuntime, Scope, Stream } from "effect";
import { afterEach, describe, expect, it } from "vitest";

import { ServerConfig } from "../../config.ts";
import { OrchestrationEventStoreLive } from "../../persistence/Layers/OrchestrationEventStore.ts";
import { OrchestrationCommandReceiptRepositoryLive } from "../../persistence/Layers/OrchestrationCommandReceipts.ts";
import { SqlitePersistenceMemory } from "../../persistence/Layers/Sqlite.ts";
import { OrchestrationEngineLive } from "./OrchestrationEngine.ts";
import { OrchestrationProjectionPipelineLive } from "./ProjectionPipeline.ts";
import { DelegationCoordinatorLive } from "./DelegationCoordinator.ts";
import { OrchestrationEngineService } from "../Services/OrchestrationEngine.ts";
import { DelegationCoordinator } from "../Services/DelegationCoordinator.ts";
import { ProviderService } from "../../provider/Services/ProviderService.ts";
import { AgentCatalogService } from "../../agent/Services/AgentCatalog.ts";
import * as NodeServices from "@effect/platform-node/NodeServices";

const asProjectId = (value: string): ProjectId => ProjectId.makeUnsafe(value);
const asThreadId = (value: string): ThreadId => ThreadId.makeUnsafe(value);
const asTaskId = (value: string): TaskId => TaskId.makeUnsafe(value);
const asAgentId = (value: string): AgentId => AgentId.makeUnsafe(value);
const asDelegationBatchId = (value: string): DelegationBatchId =>
  DelegationBatchId.makeUnsafe(value);

async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = 3000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const poll = async (): Promise<void> => {
    if (await predicate()) {
      return;
    }
    if (Date.now() >= deadline) {
      throw new Error("Timed out waiting for expectation.");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
    return poll();
  };
  return poll();
}

describe("DelegationCoordinator", () => {
  let runtime: ManagedRuntime.ManagedRuntime<
    OrchestrationEngineService | DelegationCoordinator,
    unknown
  > | null = null;
  let scope: Scope.Closeable | null = null;
  const createdStateDirs = new Set<string>();

  afterEach(async () => {
    if (scope) {
      await Effect.runPromise(Scope.close(scope, Exit.void));
    }
    scope = null;
    if (runtime) {
      await runtime.dispose();
    }
    runtime = null;
    for (const stateDir of createdStateDirs) {
      fs.rmSync(stateDir, { recursive: true, force: true });
    }
    createdStateDirs.clear();
  });

  async function createHarness() {
    const now = new Date().toISOString();
    const stateDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "t3code-delegation-"),
    );
    createdStateDirs.add(stateDir);

    const orchestrationLayer = OrchestrationEngineLive.pipe(
      Layer.provide(OrchestrationProjectionPipelineLive),
      Layer.provide(OrchestrationEventStoreLive),
      Layer.provide(OrchestrationCommandReceiptRepositoryLive),
      Layer.provide(SqlitePersistenceMemory),
    );
    // Stub ProviderService (no-op for resolveDelegation, interruptTurn, etc.)
    const stubProviderService = Layer.succeed(ProviderService, {
      startSession: () => Effect.die("not implemented in test"),
      sendTurn: () => Effect.die("not implemented in test"),
      interruptTurn: () => Effect.void,
      respondToRequest: () => Effect.die("not implemented in test"),
      respondToUserInput: () => Effect.die("not implemented in test"),
      stopSession: () => Effect.die("not implemented in test"),
      listSessions: () => Effect.succeed([]),
      getCapabilities: () => Effect.die("not implemented in test"),
      rollbackConversation: () => Effect.die("not implemented in test"),
      resolveDelegation: () => Effect.void,
      get streamEvents() { return Stream.empty; },
    } as any);
    // Stub AgentCatalogService (returns null for all agents)
    const stubAgentCatalog = Layer.succeed(AgentCatalogService, {
      getAgent: () => Effect.succeed(null),
      listAgents: () => Effect.succeed([]),
      getCatalog: () => Effect.succeed({ agents: [] }),
      resolveModelForAgent: () => Effect.succeed(null),
    } as any);
    const layer = DelegationCoordinatorLive.pipe(
      Layer.provideMerge(orchestrationLayer),
      Layer.provideMerge(stubProviderService),
      Layer.provideMerge(stubAgentCatalog),
      Layer.provideMerge(ServerConfig.layerTest(process.cwd(), stateDir)),
      Layer.provideMerge(NodeServices.layer),
    );
    const rt = ManagedRuntime.make(layer);
    runtime = rt;

    const engine = await rt.runPromise(
      Effect.service(OrchestrationEngineService),
    );
    const coordinator = await rt.runPromise(
      Effect.service(DelegationCoordinator),
    );
    scope = await Effect.runPromise(Scope.make());
    await Effect.runPromise(coordinator.start.pipe(Scope.provide(scope)));
    const drain = () => Effect.runPromise(coordinator.drain);

    // Set up project and parent thread
    await Effect.runPromise(
      engine.dispatch({
        type: "project.create",
        commandId: CommandId.makeUnsafe("cmd-project-create"),
        projectId: asProjectId("project-1"),
        title: "Delegation Project",
        workspaceRoot: "/tmp/delegation-project",
        defaultModel: "gpt-5-codex",
        createdAt: now,
      }),
    );
    await Effect.runPromise(
      engine.dispatch({
        type: "thread.create",
        commandId: CommandId.makeUnsafe("cmd-thread-create"),
        threadId: asThreadId("parent-thread"),
        projectId: asProjectId("project-1"),
        title: "Parent Thread",
        model: "gpt-5-codex",
        interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
        runtimeMode: "full-access",
        branch: null,
        worktreePath: null,
        createdAt: now,
      }),
    );

    return { engine, drain, now };
  }

  function makeChildren(count: number) {
    return Array.from({ length: count }, (_, i) => ({
      childThreadId: asThreadId(`child-thread-${i + 1}`),
      taskId: asTaskId(`task-${i + 1}`),
      agentId: asAgentId(`agent-${i + 1}`),
      subject: `Task ${i + 1}` as string & { readonly __brand?: "TrimmedNonEmptyString" },
      description: `Description for task ${i + 1}` as string & { readonly __brand?: "TrimmedNonEmptyString" },
    }));
  }

  it("dispatches child turn commands on batch start", async () => {
    const { engine, drain } = await createHarness();
    const now = new Date().toISOString();
    const children = makeChildren(2);

    await Effect.runPromise(
      engine.dispatch({
        type: "delegation.batch.start",
        commandId: CommandId.makeUnsafe("cmd-batch-start"),
        threadId: asThreadId("parent-thread"),
        delegationId: asDelegationBatchId("batch-1"),
        children,
        createdAt: now,
      }),
    );

    await drain();

    // Check that thread.turn.start events were created for each child
    const readModel = await Effect.runPromise(engine.getReadModel());
    const childThreads = readModel.threads.filter((t) =>
      t.id.startsWith("child-thread-"),
    );
    expect(childThreads.length).toBe(2);

    // Child threads should have been created with delegation lineage
    for (const child of childThreads) {
      expect(child.delegation).toBeTruthy();
      expect(child.delegation?.parentThreadId).toBe("parent-thread");
    }

    // Verify turn start commands were dispatched (check for user messages)
    await waitFor(async () => {
      const rm = await Effect.runPromise(engine.getReadModel());
      const childWithMessages = rm.threads.filter(
        (t) =>
          t.id.startsWith("child-thread-") &&
          t.messages.some((m) => m.role === "user"),
      );
      return childWithMessages.length === 2;
    });
  });

  it("respects concurrency limit of 3", async () => {
    const { engine, drain } = await createHarness();
    const now = new Date().toISOString();
    const children = makeChildren(4);

    await Effect.runPromise(
      engine.dispatch({
        type: "delegation.batch.start",
        commandId: CommandId.makeUnsafe("cmd-batch-start-concurrent"),
        threadId: asThreadId("parent-thread"),
        delegationId: asDelegationBatchId("batch-concurrent"),
        children,
        createdAt: now,
      }),
    );

    await drain();

    // After drain, at most 3 children should have user messages (turn started)
    await waitFor(async () => {
      const rm = await Effect.runPromise(engine.getReadModel());
      const childrenWithTurns = rm.threads.filter(
        (t) =>
          t.id.startsWith("child-thread-") &&
          t.messages.some((m) => m.role === "user"),
      );
      return childrenWithTurns.length === 3;
    });

    const readModel = await Effect.runPromise(engine.getReadModel());
    const childrenWithTurns = readModel.threads.filter(
      (t) =>
        t.id.startsWith("child-thread-") &&
        t.messages.some((m) => m.role === "user"),
    );
    expect(childrenWithTurns.length).toBe(3);

    // 4th child should exist but not have a turn started yet
    const allChildren = readModel.threads.filter((t) =>
      t.id.startsWith("child-thread-"),
    );
    expect(allChildren.length).toBe(4);
  });

  it("resolves dependencies before starting blocked children", async () => {
    const { engine, drain, now } = await createHarness();

    // Create tasks with dependency: task-2 blocked by task-1
    await Effect.runPromise(
      engine.dispatch({
        type: "task.create",
        commandId: CommandId.makeUnsafe("cmd-task-create-1"),
        threadId: asThreadId("parent-thread"),
        task: {
          id: asTaskId("task-1"),
          subject: "Task 1" as string & { readonly __brand?: "TrimmedNonEmptyString" },
          status: "pending",
          blockedBy: [],
          blocks: [asTaskId("task-2")],
        },
        createdAt: now,
      }),
    );
    await Effect.runPromise(
      engine.dispatch({
        type: "task.create",
        commandId: CommandId.makeUnsafe("cmd-task-create-2"),
        threadId: asThreadId("parent-thread"),
        task: {
          id: asTaskId("task-2"),
          subject: "Task 2" as string & { readonly __brand?: "TrimmedNonEmptyString" },
          status: "pending",
          blockedBy: [asTaskId("task-1")],
          blocks: [],
        },
        createdAt: now,
      }),
    );

    // Start batch with dependency
    const children = [
      {
        childThreadId: asThreadId("child-a"),
        taskId: asTaskId("task-1"),
        agentId: asAgentId("agent-1"),
        subject: "Task 1" as string & { readonly __brand?: "TrimmedNonEmptyString" },
        description: "Do task 1" as string & { readonly __brand?: "TrimmedNonEmptyString" },
      },
      {
        childThreadId: asThreadId("child-b"),
        taskId: asTaskId("task-2"),
        agentId: asAgentId("agent-2"),
        subject: "Task 2" as string & { readonly __brand?: "TrimmedNonEmptyString" },
        description: "Do task 2" as string & { readonly __brand?: "TrimmedNonEmptyString" },
      },
    ];

    await Effect.runPromise(
      engine.dispatch({
        type: "delegation.batch.start",
        commandId: CommandId.makeUnsafe("cmd-batch-deps"),
        threadId: asThreadId("parent-thread"),
        delegationId: asDelegationBatchId("batch-deps"),
        children,
        createdAt: now,
      }),
    );

    await drain();

    // Only child-a (task-1, no blockers) should have started
    await waitFor(async () => {
      const rm = await Effect.runPromise(engine.getReadModel());
      const childA = rm.threads.find((t) => t.id === "child-a");
      return childA?.messages.some((m) => m.role === "user") ?? false;
    });

    const readModel = await Effect.runPromise(engine.getReadModel());
    const childA = readModel.threads.find((t) => t.id === "child-a");
    const childB = readModel.threads.find((t) => t.id === "child-b");
    expect(childA?.messages.some((m) => m.role === "user")).toBe(true);
    expect(childB?.messages.some((m) => m.role === "user")).toBe(false);
  });
});
