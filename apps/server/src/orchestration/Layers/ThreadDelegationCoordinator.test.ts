import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  CommandId,
  ProjectId,
  RuntimeRequestId,
  EventId,
  ThreadId,
  type ProviderRuntimeEvent,
} from "@t3tools/contracts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { Effect, Exit, Layer, ManagedRuntime, PubSub, Scope, Stream } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ServerConfig } from "../../config.ts";
import { GitCore, type GitCoreShape } from "../../git/Services/GitCore.ts";
import { OrchestrationCommandReceiptRepositoryLive } from "../../persistence/Layers/OrchestrationCommandReceipts.ts";
import { OrchestrationEventStoreLive } from "../../persistence/Layers/OrchestrationEventStore.ts";
import { SqlitePersistenceMemory } from "../../persistence/Layers/Sqlite.ts";
import {
  ProviderService,
  type ProviderServiceShape,
} from "../../provider/Services/ProviderService.ts";
import { OrchestrationEngineLive } from "./OrchestrationEngine.ts";
import { OrchestrationProjectionPipelineLive } from "./ProjectionPipeline.ts";
import { ThreadDelegationCoordinatorLive } from "./ThreadDelegationCoordinator.ts";
import { OrchestrationEngineService } from "../Services/OrchestrationEngine.ts";
import { ThreadDelegationCoordinator } from "../Services/ThreadDelegationCoordinator.ts";

const asProjectId = (value: string): ProjectId => ProjectId.makeUnsafe(value);

async function waitFor(predicate: () => boolean | Promise<boolean>, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for expectation.");
}

describe("ThreadDelegationCoordinator", () => {
  let runtime: ManagedRuntime.ManagedRuntime<
    OrchestrationEngineService | ThreadDelegationCoordinator,
    unknown
  > | null = null;
  let scope: Scope.Closeable | null = null;
  const createdStateDirs = new Set<string>();

  afterEach(async () => {
    if (scope) {
      await Effect.runPromise(Scope.close(scope, Exit.void));
    }
    if (runtime) {
      await runtime.dispose();
    }
    scope = null;
    runtime = null;
    for (const stateDir of createdStateDirs) {
      fs.rmSync(stateDir, { recursive: true, force: true });
    }
    createdStateDirs.clear();
  });

  async function createHarness() {
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "t3code-delegation-"));
    createdStateDirs.add(stateDir);
    const runtimeEventPubSub = Effect.runSync(PubSub.unbounded<ProviderRuntimeEvent>());
    const resolveToolCall = vi.fn<ProviderServiceShape["resolveToolCall"]>(() => Effect.void);
    const unsupported = () => Effect.die(new Error("Unsupported provider call in test")) as never;
    const providerService: ProviderServiceShape = {
      startSession: () => unsupported(),
      sendTurn: () => unsupported(),
      interruptTurn: () => unsupported(),
      respondToRequest: () => unsupported(),
      respondToUserInput: () => unsupported(),
      resolveToolCall,
      stopSession: () => unsupported(),
      listSessions: () => Effect.succeed([]),
      getCapabilities: () => Effect.succeed({ sessionModelSwitch: "in-session" }),
      rollbackConversation: () => unsupported(),
      streamEvents: Stream.fromPubSub(runtimeEventPubSub),
    };
    const gitCore: GitCoreShape = {
      status: () =>
        Effect.succeed({
          branch: "main",
          hasWorkingTreeChanges: false,
          workingTree: { files: [], insertions: 0, deletions: 0 },
          hasUpstream: true,
          aheadCount: 0,
          behindCount: 0,
          pr: null,
        }),
      statusDetails: () =>
        Effect.succeed({
          branch: "main",
          hasWorkingTreeChanges: false,
          workingTree: { files: [], insertions: 0, deletions: 0 },
          hasUpstream: true,
          aheadCount: 0,
          behindCount: 0,
          pr: null,
          upstreamRef: "origin/main",
        }),
      prepareCommitContext: () => unsupported(),
      commit: () => unsupported(),
      pushCurrentBranch: () => unsupported(),
      readRangeContext: () => unsupported(),
      readConfigValue: () => unsupported(),
      listBranches: () => unsupported(),
      pullCurrentBranch: () => unsupported(),
      createWorktree: () => unsupported(),
      removeWorktree: () => unsupported(),
      renameBranch: () => unsupported(),
      createBranch: () => unsupported(),
      checkoutBranch: () => unsupported(),
      initRepo: () => unsupported(),
      listLocalBranchNames: () => unsupported(),
    };

    const orchestrationLayer = OrchestrationEngineLive.pipe(
      Layer.provide(OrchestrationProjectionPipelineLive),
      Layer.provide(OrchestrationEventStoreLive),
      Layer.provide(OrchestrationCommandReceiptRepositoryLive),
      Layer.provide(SqlitePersistenceMemory),
    );
    const layer = ThreadDelegationCoordinatorLive.pipe(
      Layer.provideMerge(orchestrationLayer),
      Layer.provideMerge(Layer.succeed(ProviderService, providerService)),
      Layer.provideMerge(Layer.succeed(GitCore, gitCore)),
      Layer.provideMerge(ServerConfig.layerTest(process.cwd(), stateDir)),
      Layer.provideMerge(NodeServices.layer),
    );
    runtime = ManagedRuntime.make(layer);
    const engine = await runtime.runPromise(Effect.service(OrchestrationEngineService));
    const coordinator = await runtime.runPromise(Effect.service(ThreadDelegationCoordinator));
    scope = await Effect.runPromise(Scope.make("sequential"));
    await Effect.runPromise(coordinator.start.pipe(Scope.provide(scope)));
    await Effect.runPromise(
      engine.dispatch({
        type: "project.create",
        commandId: CommandId.makeUnsafe("cmd-project"),
        projectId: asProjectId("project-1"),
        title: "Project",
        workspaceRoot: process.cwd(),
        defaultModel: "gpt-5-codex",
        createdAt: "2026-03-12T00:00:00.000Z",
      }),
    );
    await Effect.runPromise(
      engine.dispatch({
        type: "thread.create",
        commandId: CommandId.makeUnsafe("cmd-parent-thread"),
        threadId: ThreadId.makeUnsafe("thread-parent"),
        projectId: asProjectId("project-1"),
        title: "Parent",
        model: "gpt-5-codex",
        runtimeMode: "full-access",
        interactionMode: "default",
        branch: "feature/parent",
        worktreePath: "/tmp/worktree-parent",
        createdAt: "2026-03-12T00:00:00.000Z",
      }),
    );

    return {
      engine,
      runtimeEventPubSub,
      resolveToolCall,
    };
  }

  it("spawns child threads from a dynamic delegate_threads tool call and resolves when the child completes", async () => {
    const harness = await createHarness();

    await Effect.runPromise(
      PubSub.publish(harness.runtimeEventPubSub, {
        eventId: EventId.makeUnsafe("evt-delegate-tool"),
        provider: "codex",
        type: "request.opened",
        threadId: ThreadId.makeUnsafe("thread-parent"),
        requestId: RuntimeRequestId.makeUnsafe("req-delegate-1"),
        createdAt: "2026-03-12T00:00:01.000Z",
        payload: {
          requestType: "dynamic_tool_call",
          args: {
            name: "delegate_threads",
            tasks: [
              {
                title: "Task 1",
                prompt: "Implement task 1",
              },
            ],
          },
        },
      } satisfies ProviderRuntimeEvent),
    );

    await waitFor(async () => {
      const model = await Effect.runPromise(harness.engine.getReadModel());
      const childThread = model.threads.find((thread) => thread.id !== "thread-parent");
      return model.threads.length === 2 && (childThread?.messages.length ?? 0) > 0;
    });

    const afterSpawn = await Effect.runPromise(harness.engine.getReadModel());
    const childThread = afterSpawn.threads.find((thread) => thread.id !== "thread-parent");
    expect(childThread?.lineage.role).toBe("child");
    expect(childThread?.messages.at(-1)?.role).toBe("user");
    expect(afterSpawn.threads.find((thread) => thread.id === "thread-parent")?.delegationBatches).toHaveLength(1);

    await Effect.runPromise(
      harness.engine.dispatch({
        type: "thread.turn.diff.complete",
        commandId: CommandId.makeUnsafe("cmd-child-complete"),
        threadId: childThread!.id,
        turnId: "turn-child-1" as any,
        completedAt: "2026-03-12T00:00:02.000Z",
        checkpointRef: "checkpoint-1" as any,
        status: "ready",
        files: [],
        checkpointTurnCount: 1,
        createdAt: "2026-03-12T00:00:02.000Z",
      }),
    );

    await waitFor(() => harness.resolveToolCall.mock.calls.length === 1);
    expect(harness.resolveToolCall.mock.calls[0]?.[0]).toMatchObject({
      threadId: "thread-parent",
      requestId: "req-delegate-1",
    });
  });
});
