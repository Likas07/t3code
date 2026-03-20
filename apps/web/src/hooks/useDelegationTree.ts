import { useMemo } from "react";
import type { Thread } from "../types";

export interface DelegationTreeNode {
  thread: Thread;
  children: DelegationTreeNode[];
}

export function useDelegationTree(threads: Thread[]) {
  return useMemo(() => {
    const childrenMap = new Map<string, DelegationTreeNode[]>();
    const roots: DelegationTreeNode[] = [];

    for (const thread of threads) {
      const node: DelegationTreeNode = { thread, children: [] };
      if (thread.delegation?.parentThreadId) {
        const siblings = childrenMap.get(thread.delegation.parentThreadId) ?? [];
        siblings.push(node);
        childrenMap.set(thread.delegation.parentThreadId, siblings);
      } else {
        roots.push(node);
      }
    }

    // Attach children to their parent nodes
    function attachChildren(node: DelegationTreeNode) {
      const kids = childrenMap.get(node.thread.id) ?? [];
      kids.sort((a, b) => a.thread.createdAt.localeCompare(b.thread.createdAt));
      node.children = kids;
      for (const child of kids) attachChildren(child);
    }
    for (const root of roots) attachChildren(root);

    return { roots };
  }, [threads]);
}
