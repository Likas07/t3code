import { memo, useState } from "react";
import {
  CheckCircle2,
  ChevronDownIcon,
  ChevronRightIcon,
  Circle,
  Loader2,
  XCircle,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { Badge } from "./ui/badge";
import type { DelegationTreeNode } from "../hooks/useDelegationTree";

function statusIcon(node: DelegationTreeNode) {
  const { session, error } = node.thread;
  if (error) {
    return <XCircle className="size-4 shrink-0 text-red-500" />;
  }
  if (session?.status === "running") {
    return <Loader2 className="size-4 shrink-0 animate-spin text-blue-500" />;
  }
  if (session && session.status === "ready") {
    return <CheckCircle2 className="size-4 shrink-0 text-green-500" />;
  }
  return <Circle className="size-4 shrink-0 text-muted-foreground" />;
}

interface DelegationTreeProps {
  nodes: DelegationTreeNode[];
  depth?: number | undefined;
  onSelectThread: (threadId: string) => void;
  activeThreadId?: string | undefined;
}

export const DelegationTree = memo(function DelegationTree({
  nodes,
  depth = 0,
  onSelectThread,
  activeThreadId,
}: DelegationTreeProps) {
  return (
    <div role={depth === 0 ? "tree" : "group"}>
      {nodes.map((node) => (
        <DelegationTreeRow
          key={node.thread.id}
          node={node}
          depth={depth}
          onSelectThread={onSelectThread}
          activeThreadId={activeThreadId}
        />
      ))}
    </div>
  );
});

const DelegationTreeRow = memo(function DelegationTreeRow({
  node,
  depth,
  onSelectThread,
  activeThreadId,
}: {
  node: DelegationTreeNode;
  depth: number;
  onSelectThread: (threadId: string) => void;
  activeThreadId?: string | undefined;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;
  const isActive = node.thread.id === activeThreadId;

  return (
    <div role="treeitem" aria-expanded={hasChildren ? expanded : undefined}>
      <button
        type="button"
        className={cn(
          "flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors hover:bg-accent/50",
          isActive && "bg-accent",
        )}
        style={{ paddingLeft: `${depth * 16}px` }}
        onClick={() => onSelectThread(node.thread.id)}
      >
        {hasChildren ? (
          <button
            type="button"
            className="shrink-0 p-0.5"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
          >
            {expanded ? (
              <ChevronDownIcon className="size-3.5 text-muted-foreground" />
            ) : (
              <ChevronRightIcon className="size-3.5 text-muted-foreground" />
            )}
          </button>
        ) : (
          <span className="w-4.5 shrink-0" />
        )}
        {statusIcon(node)}
        <span className="truncate">{node.thread.title || "Untitled"}</span>
        {node.thread.agentId && (
          <Badge variant="secondary" size="sm" className="ml-auto">
            {node.thread.agentId}
          </Badge>
        )}
      </button>
      {hasChildren && expanded && (
        <DelegationTree
          nodes={node.children}
          depth={depth + 1}
          onSelectThread={onSelectThread}
          activeThreadId={activeThreadId}
        />
      )}
    </div>
  );
});
