import { ProjectId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vitest";

import { buildSidebarThreadTree } from "./sidebarThreadTree";
import { DEFAULT_INTERACTION_MODE, DEFAULT_RUNTIME_MODE, type Thread } from "./types";

function makeThread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: ThreadId.makeUnsafe("thread-1"),
    codexThreadId: null,
    projectId: ProjectId.makeUnsafe("project-1"),
    title: "Thread",
    model: "gpt-5-codex",
    runtimeMode: DEFAULT_RUNTIME_MODE,
    interactionMode: DEFAULT_INTERACTION_MODE,
    session: null,
    messages: [],
    turnDiffSummaries: [],
    activities: [],
    proposedPlans: [],
    error: null,
    createdAt: "2026-03-12T12:00:00.000Z",
    latestTurn: null,
    branch: null,
    worktreePath: null,
    lineage: {
      rootThreadId: ThreadId.makeUnsafe("thread-1"),
      parentThreadId: null,
      delegationDepth: 0,
      role: "primary",
      parentBatchId: null,
      parentTaskIndex: null,
    },
    delegationBatches: [],
    ...overrides,
  };
}

describe("buildSidebarThreadTree", () => {
  it("groups child threads under their parent", () => {
    const projectId = ProjectId.makeUnsafe("project-1");
    const parent = makeThread({
      id: ThreadId.makeUnsafe("parent"),
      projectId,
      createdAt: "2026-03-12T13:00:00.000Z",
      lineage: {
        rootThreadId: ThreadId.makeUnsafe("parent"),
        parentThreadId: null,
        delegationDepth: 0,
        role: "primary",
        parentBatchId: null,
        parentTaskIndex: null,
      },
    });
    const childTwo = makeThread({
      id: ThreadId.makeUnsafe("child-2"),
      projectId,
      title: "Child 2",
      createdAt: "2026-03-12T13:10:00.000Z",
      lineage: {
        rootThreadId: ThreadId.makeUnsafe("parent"),
        parentThreadId: parent.id,
        delegationDepth: 1,
        role: "child",
        parentBatchId: "batch-1",
        parentTaskIndex: 1,
      },
    });
    const childOne = makeThread({
      id: ThreadId.makeUnsafe("child-1"),
      projectId,
      title: "Child 1",
      createdAt: "2026-03-12T13:05:00.000Z",
      lineage: {
        rootThreadId: ThreadId.makeUnsafe("parent"),
        parentThreadId: parent.id,
        delegationDepth: 1,
        role: "child",
        parentBatchId: "batch-1",
        parentTaskIndex: 0,
      },
    });
    const unrelated = makeThread({
      id: ThreadId.makeUnsafe("other"),
      projectId,
      createdAt: "2026-03-12T14:00:00.000Z",
      lineage: {
        rootThreadId: ThreadId.makeUnsafe("other"),
        parentThreadId: null,
        delegationDepth: 0,
        role: "primary",
        parentBatchId: null,
        parentTaskIndex: null,
      },
    });

    const tree = buildSidebarThreadTree([childTwo, unrelated, childOne, parent], projectId);

    expect(tree.map((node) => node.thread.id)).toEqual([unrelated.id, parent.id]);
    expect(tree[1]?.children.map((node) => node.thread.id)).toEqual([childOne.id, childTwo.id]);
  });

  it("keeps orphaned child threads at the top level", () => {
    const projectId = ProjectId.makeUnsafe("project-1");
    const orphan = makeThread({
      id: ThreadId.makeUnsafe("orphan"),
      projectId,
      lineage: {
        rootThreadId: ThreadId.makeUnsafe("missing-parent"),
        parentThreadId: ThreadId.makeUnsafe("missing-parent"),
        delegationDepth: 1,
        role: "child",
        parentBatchId: "batch-1",
        parentTaskIndex: 0,
      },
    });

    const tree = buildSidebarThreadTree([orphan], projectId);

    expect(tree).toHaveLength(1);
    expect(tree[0]?.thread.id).toBe(orphan.id);
  });
});
