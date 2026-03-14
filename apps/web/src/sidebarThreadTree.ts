import type { ProjectId, ThreadId } from "@t3tools/contracts";

import type { Thread } from "./types";

export interface SidebarThreadNode {
  thread: Thread;
  children: SidebarThreadNode[];
}

function compareThreadsByCreatedAtDesc(left: Thread, right: Thread): number {
  const byDate = Date.parse(right.createdAt) - Date.parse(left.createdAt);
  if (byDate !== 0) {
    return byDate;
  }
  return right.id.localeCompare(left.id);
}

function compareChildThreads(left: Thread, right: Thread): number {
  const leftIndex = left.lineage.parentTaskIndex ?? Number.MAX_SAFE_INTEGER;
  const rightIndex = right.lineage.parentTaskIndex ?? Number.MAX_SAFE_INTEGER;
  if (leftIndex !== rightIndex) {
    return leftIndex - rightIndex;
  }
  return compareThreadsByCreatedAtDesc(left, right);
}

function buildNode(
  thread: Thread,
  childrenByParentId: ReadonlyMap<ThreadId, Thread[]>,
): SidebarThreadNode {
  const children = (childrenByParentId.get(thread.id) ?? [])
    .toSorted(compareChildThreads)
    .map((child) => buildNode(child, childrenByParentId));
  return { thread, children };
}

export function buildSidebarThreadTree(
  threads: ReadonlyArray<Thread>,
  projectId: ProjectId,
): SidebarThreadNode[] {
  const projectThreads = threads
    .filter((thread) => thread.projectId === projectId)
    .toSorted(compareThreadsByCreatedAtDesc);
  const threadById = new Map(projectThreads.map((thread) => [thread.id, thread] as const));
  const childrenByParentId = new Map<ThreadId, Thread[]>();
  const rootThreads: Thread[] = [];

  for (const thread of projectThreads) {
    const parentThreadId = thread.lineage.parentThreadId;
    if (thread.lineage.role === "child" && parentThreadId && threadById.has(parentThreadId)) {
      const siblings = childrenByParentId.get(parentThreadId) ?? [];
      siblings.push(thread);
      childrenByParentId.set(parentThreadId, siblings);
      continue;
    }
    rootThreads.push(thread);
  }

  return rootThreads.map((thread) => buildNode(thread, childrenByParentId));
}
