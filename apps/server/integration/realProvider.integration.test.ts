/**
 * Real Provider Integration Tests
 *
 * These tests run against actual Claude and Codex binaries (already
 * authenticated on the host machine). They verify the full end-to-end
 * flow: agent selection → provider session → turn execution → delegation.
 *
 * These tests are SKIPPED by default. Run them explicitly:
 *   REAL_PROVIDER_TESTS=1 bun test integration/realProvider.integration.test.ts
 *
 * KNOWN ISSUE: The Claude adapter layer hangs during initialization in the
 * test harness. This needs investigation — the makeClaudeAdapterLive() layer
 * may require additional setup (e.g. the SDK import or session init blocks).
 * The Codex path (withRealCodexHarness) may work if Codex binary is available.
 *
 * These tests are slower (10-60s per test) because they involve real LLM inference.
 */
import { describe } from "vitest";

const SKIP = !process.env.REAL_PROVIDER_TESTS;
const describeReal = SKIP ? describe.skip : describe;

import {
  AgentId,
  CommandId,
  DEFAULT_MODEL_BY_PROVIDER,
  DEFAULT_PROVIDER_INTERACTION_MODE,
  DelegationBatchId,
  MessageId,
  ProjectId,
  TaskId,
  ThreadId,
} from "@t3tools/contracts";
import { assert, it } from "@effect/vitest";
import { Effect } from "effect";

import {
  makeOrchestrationIntegrationHarness,
  type OrchestrationIntegrationHarness,
} from "./OrchestrationEngineHarness.integration.ts";

const PROJECT_ID = ProjectId.makeUnsafe("real-provider-project");
const nowIso = () => new Date().toISOString();
let threadCounter = 0;
const nextThreadId = () => ThreadId.makeUnsafe(`real-thread-${++threadCounter}-${Date.now()}`);

const PROVIDER_BINARY_PATHS = {
  codex: "/home/likas/.local/share/mise/installs/node/25.2.1/bin/codex",
  claudeAgent: "/home/likas/.local/bin/claude",
} as const;

function withRealCodexHarness<A, E>(
  use: (harness: OrchestrationIntegrationHarness) => Effect.Effect<A, E>,
) {
  return Effect.acquireUseRelease(
    makeOrchestrationIntegrationHarness({ provider: "codex", realCodex: true }),
    use,
    (harness) => harness.dispose,
  );
}

function withRealClaudeHarness<A, E>(
  use: (harness: OrchestrationIntegrationHarness) => Effect.Effect<A, E>,
) {
  return Effect.acquireUseRelease(
    makeOrchestrationIntegrationHarness({ provider: "claudeAgent", realClaude: true }),
    use,
    (harness) => harness.dispose,
  );
}

const seedProject = (harness: OrchestrationIntegrationHarness) =>
  harness.engine.dispatch({
    type: "project.create",
    commandId: CommandId.makeUnsafe(`cmd-project-${Date.now()}`),
    projectId: PROJECT_ID,
    title: "Real Provider Test Project",
    workspaceRoot: harness.workspaceDir,
    defaultModel: DEFAULT_MODEL_BY_PROVIDER.claudeAgent,
    createdAt: nowIso(),
  });

const createThread = (
  harness: OrchestrationIntegrationHarness,
  options?: { agentId?: string; model?: string },
) => {
  const threadId = nextThreadId();
  const createdAt = nowIso();
  return Effect.gen(function* () {
    yield* harness.engine.dispatch({
      type: "thread.create",
      commandId: CommandId.makeUnsafe(`cmd-create-${threadId}`),
      threadId,
      projectId: PROJECT_ID,
      title: "Real Provider Thread",
      model: options?.model ?? DEFAULT_MODEL_BY_PROVIDER.claudeAgent,
      ...(options?.agentId ? { agentId: AgentId.makeUnsafe(options.agentId) } : {}),
      interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
      runtimeMode: "full-access",
      branch: null,
      worktreePath: harness.workspaceDir,
      createdAt,
    });
    return threadId;
  });
};

function log(message: string, data?: Record<string, unknown>) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}] ${message}`, data ? JSON.stringify(data) : "");
}

const startTurn = (
  harness: OrchestrationIntegrationHarness,
  threadId: ThreadId,
  text: string,
  options?: { provider?: "codex" | "claudeAgent"; agentId?: string },
) => {
  const provider = options?.provider ?? "claudeAgent";
  const binaryPath = PROVIDER_BINARY_PATHS[provider];
  log("startTurn", { threadId, provider, binaryPath, text: text.slice(0, 80) });
  return harness.engine.dispatch({
    type: "thread.turn.start",
    commandId: CommandId.makeUnsafe(`cmd-turn-${Date.now()}`),
    threadId,
    message: {
      messageId: MessageId.makeUnsafe(`msg-${Date.now()}`),
      role: "user",
      text,
      attachments: [],
    },
    provider,
    model: DEFAULT_MODEL_BY_PROVIDER[provider],
    providerOptions: {
      [provider]: { binaryPath },
    },
    assistantDeliveryMode: "streaming",
    runtimeMode: "full-access",
    interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
    ...(options?.agentId ? { agentId: AgentId.makeUnsafe(options.agentId) } : {}),
    createdAt: nowIso(),
  });
};

// ── Tests ─────────────────────────────────────────────────────────

describeReal("real provider integration", () => {

it.effect(
  "harness setup smoke test (Claude)",
  () =>
    withRealClaudeHarness((harness) =>
      Effect.gen(function* () {
        log("=== Harness smoke test ===");
        log("Harness created", { workspaceDir: harness.workspaceDir });
        yield* seedProject(harness);
        log("Project seeded");
        const threadId = yield* createThread(harness);
        log("Thread created", { threadId });
        // Just verify the harness is functional
        assert.isTrue(true, "Harness setup completed successfully");
        log("=== Harness smoke test PASSED ===");
      }),
    ),
  { timeout: 30_000 },
);

it.effect(
  "runs a simple Claude turn end-to-end with a real provider",
  () =>
    withRealClaudeHarness((harness) =>
      Effect.gen(function* () {
        log("=== Claude turn test start ===");
        yield* seedProject(harness);
        const threadId = yield* createThread(harness, { model: "claude-sonnet-4-6" });
        log("Thread created", { threadId });

        yield* startTurn(harness, threadId, "Respond with exactly: HELLO_INTEGRATION_TEST", {
          provider: "claudeAgent",
        });
        log("Turn dispatched, waiting for session to start running...");

        // Wait for the session to start running
        const runningThread = yield* harness.waitForThread(
          threadId,
          (thread) => {
            if (thread.session) {
              log("Session status poll", { status: thread.session.status, lastError: thread.session.lastError });
            }
            return thread.session?.status === "running";
          },
          15_000,
        );
        log("Session is running");
        assert.strictEqual(runningThread.session?.status, "running");

        // Wait for the turn to complete (session goes to "ready")
        const completedThread = yield* harness.waitForThread(
          threadId,
          (thread) =>
            thread.session?.status === "ready" || thread.session?.status === "stopped",
          60_000,
        );
        log("Turn completed", { status: completedThread.session?.status, messageCount: completedThread.messages.length });

        // Verify we got assistant messages
        const assistantMessages = completedThread.messages.filter((m) => m.role === "assistant");
        assert.isTrue(
          assistantMessages.length > 0,
          "Expected at least one assistant message",
        );

        // Verify the response contains our expected text
        const lastAssistant = assistantMessages[assistantMessages.length - 1];
        log("Last assistant message", { text: lastAssistant!.text.slice(0, 200) });
        assert.isTrue(
          lastAssistant!.text.includes("HELLO_INTEGRATION_TEST"),
          `Expected response to contain HELLO_INTEGRATION_TEST, got: ${lastAssistant!.text.slice(0, 200)}`,
        );
        log("=== Claude turn test PASSED ===");
      }),
    ),
  { timeout: 90_000 },
);

it.effect(
  "runs a simple Codex turn end-to-end with a real provider",
  () =>
    withRealCodexHarness((harness) =>
      Effect.gen(function* () {
        log("=== Codex turn test start ===");
        yield* seedProject(harness);
        const threadId = yield* createThread(harness, { model: "gpt-5.4-mini" });
        log("Thread created", { threadId });

        yield* startTurn(harness, threadId, "Respond with exactly: CODEX_INTEGRATION_TEST", {
          provider: "codex",
        });
        log("Turn dispatched, waiting for completion...");

        // Wait for the turn to complete
        const completedThread = yield* harness.waitForThread(
          threadId,
          (thread) => {
            if (thread.session) {
              log("Session status poll", { status: thread.session.status, lastError: thread.session.lastError });
            }
            return thread.session?.status === "ready" || thread.session?.status === "stopped";
          },
          60_000,
        );
        log("Turn completed", { status: completedThread.session?.status, messageCount: completedThread.messages.length });

        const assistantMessages = completedThread.messages.filter((m) => m.role === "assistant");
        assert.isTrue(
          assistantMessages.length > 0,
          "Expected at least one assistant message",
        );
        log("=== Codex turn test PASSED ===");
      }),
    ),
  { timeout: 90_000 },
);

it.effect(
  "creates a delegation batch and child threads appear in the read model",
  () =>
    withRealClaudeHarness((harness) =>
      Effect.gen(function* () {
        log("=== Delegation batch test start ===");
        yield* seedProject(harness);
        const parentThreadId = yield* createThread(harness);
        log("Parent thread created", { parentThreadId });

        // Create a delegation batch with 2 child tasks
        const delegationId = DelegationBatchId.makeUnsafe(`batch-${Date.now()}`);
        const childThread1 = ThreadId.makeUnsafe(`child-1-${Date.now()}`);
        const childThread2 = ThreadId.makeUnsafe(`child-2-${Date.now()}`);
        const task1 = TaskId.makeUnsafe(`task-1-${Date.now()}`);
        const task2 = TaskId.makeUnsafe(`task-2-${Date.now()}`);

        log("Dispatching delegation.batch.start", { delegationId, childThread1, childThread2 });
        yield* harness.engine.dispatch({
          type: "delegation.batch.start",
          commandId: CommandId.makeUnsafe(`cmd-delegation-${Date.now()}`),
          threadId: parentThreadId,
          delegationId,
          children: [
            {
              childThreadId: childThread1,
              taskId: task1,
              agentId: AgentId.makeUnsafe("explore"),
              subject: "Find test files",
              description: "Search for test files in the workspace",
            },
            {
              childThreadId: childThread2,
              taskId: task2,
              agentId: AgentId.makeUnsafe("explore"),
              subject: "Find config files",
              description: "Search for configuration files",
            },
          ],
          createdAt: nowIso(),
        });

        log("Batch dispatched, waiting for child threads...");
        // Wait for child threads to appear in the read model
        const child1 = yield* harness.waitForThread(
          childThread1,
          (thread) => thread.delegation !== null,
          10_000,
        );
        const child2 = yield* harness.waitForThread(
          childThread2,
          (thread) => thread.delegation !== null,
          10_000,
        );

        log("Child threads appeared", { child1Id: child1.id, child2Id: child2.id });
        // Verify delegation lineage
        assert.strictEqual(child1.delegation!.parentThreadId, parentThreadId);
        assert.strictEqual(child1.delegation!.depth, 1);
        assert.strictEqual(child2.delegation!.parentThreadId, parentThreadId);
        assert.strictEqual(child2.delegation!.depth, 1);

        // Verify child threads have the correct agent
        assert.strictEqual(child1.agentId, "explore");
        assert.strictEqual(child2.agentId, "explore");

        // Verify child threads belong to the same project
        assert.strictEqual(child1.projectId, PROJECT_ID);
        assert.strictEqual(child2.projectId, PROJECT_ID);
        log("=== Delegation batch test PASSED ===");
      }),
    ),
  { timeout: 30_000 },
);

it.effect(
  "delegation depth limit prevents over-nesting",
  () =>
    withRealClaudeHarness((harness) =>
      Effect.gen(function* () {
        yield* seedProject(harness);
        const parentThreadId = yield* createThread(harness);

        // First level delegation
        const delegationId1 = DelegationBatchId.makeUnsafe(`batch-l1-${Date.now()}`);
        const childThread = ThreadId.makeUnsafe(`child-l1-${Date.now()}`);
        const task1 = TaskId.makeUnsafe(`task-l1-${Date.now()}`);

        yield* harness.engine.dispatch({
          type: "delegation.batch.start",
          commandId: CommandId.makeUnsafe(`cmd-del-l1-${Date.now()}`),
          threadId: parentThreadId,
          delegationId: delegationId1,
          children: [
            {
              childThreadId: childThread,
              taskId: task1,
              agentId: AgentId.makeUnsafe("sisyphus-junior"),
              subject: "Level 1 task",
              description: "First level delegation",
            },
          ],
          createdAt: nowIso(),
        });

        // Wait for child to exist
        yield* harness.waitForThread(
          childThread,
          (t) => t.delegation !== null,
          10_000,
        );

        // Second level delegation from child — should succeed (depth 1 → 2, maxDepth is 2)
        const grandchildThread = ThreadId.makeUnsafe(`child-l2-${Date.now()}`);
        const delegationId2 = DelegationBatchId.makeUnsafe(`batch-l2-${Date.now()}`);
        const task2 = TaskId.makeUnsafe(`task-l2-${Date.now()}`);

        // This should fail because childDepth would be 2 which equals maxDepth (2)
        const result = yield* Effect.exit(
          harness.engine.dispatch({
            type: "delegation.batch.start",
            commandId: CommandId.makeUnsafe(`cmd-del-l2-${Date.now()}`),
            threadId: childThread,
            delegationId: delegationId2,
            children: [
              {
                childThreadId: grandchildThread,
                taskId: task2,
                agentId: AgentId.makeUnsafe("explore"),
                subject: "Level 2 task",
                description: "Second level delegation (should be rejected)",
              },
            ],
            createdAt: nowIso(),
          }),
        );

        // The dispatch should fail with an invariant error
        assert.isTrue(
          result._tag === "Failure",
          "Expected delegation at max depth to be rejected",
        );
      }),
    ),
  { timeout: 30_000 },
);

}); // describeReal
