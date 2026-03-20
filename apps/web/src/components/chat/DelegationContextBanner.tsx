import { memo, useMemo, useState } from "react";
import { ArrowLeftIcon, ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import type { Thread } from "../../types";
import { TaskListView } from "../TaskListView";

interface DelegationContextBannerProps {
  thread: Thread;
  allThreads: Thread[];
}

export const DelegationContextBanner = memo(function DelegationContextBanner({
  thread,
  allThreads,
}: DelegationContextBannerProps) {
  const [tasksExpanded, setTasksExpanded] = useState(false);

  const parentThread = useMemo(() => {
    if (!thread.delegation?.parentThreadId) return null;
    return allThreads.find((t) => t.id === thread.delegation!.parentThreadId) ?? null;
  }, [thread, allThreads]);

  const taskProgress = useMemo(() => {
    if (!thread.delegationTasks || thread.delegationTasks.length === 0) return null;
    const completed = thread.delegationTasks.filter((t) => t.status === "completed").length;
    const running = thread.delegationTasks.filter((t) => t.status === "in_progress").length;
    const blocked = thread.delegationTasks.filter(
      (t) => t.status === "pending" && t.blockedBy.length > 0,
    ).length;
    return { completed, running, blocked, total: thread.delegationTasks.length };
  }, [thread.delegationTasks]);

  // Child thread: show parent info and agent
  if (thread.delegation && parentThread) {
    const agentLabel = thread.agentId
      ?.replace(/-/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
    return (
      <div className="mx-3 mt-2 sm:mx-5" role="status" aria-live="polite">
        <div className="mx-auto flex max-w-3xl items-center gap-2 rounded-md border border-border/50 bg-muted/50 px-3 py-2 text-sm">
          <ArrowLeftIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="text-muted-foreground">
            Sub-thread of{" "}
            <span className="font-medium text-foreground">
              {parentThread.title || "Untitled"}
            </span>
            {agentLabel && (
              <>
                {" \u00b7 "}
                <span className="inline-flex items-center rounded bg-primary/10 px-1 py-0.5 text-[10px] font-medium text-primary/70">
                  {agentLabel}
                </span>
              </>
            )}
          </span>
        </div>
      </div>
    );
  }

  // Parent thread with active delegation tasks
  if (taskProgress && taskProgress.total > 0) {
    return (
      <div className="mx-3 mt-2 sm:mx-5" role="status" aria-live="polite">
        <div className="mx-auto max-w-3xl rounded-md border border-border/50 bg-muted/50">
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted/80"
            onClick={() => setTasksExpanded(!tasksExpanded)}
          >
            {tasksExpanded ? (
              <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground" />
            )}
            <span className="text-muted-foreground">
              Delegation: {taskProgress.completed}/{taskProgress.total} complete
              {taskProgress.running > 0 && (
                <span className="text-blue-500"> \u00b7 {taskProgress.running} running</span>
              )}
              {taskProgress.blocked > 0 && (
                <span className="text-orange-500"> \u00b7 {taskProgress.blocked} blocked</span>
              )}
            </span>
          </button>
          {tasksExpanded && (
            <div className="border-t border-border/50 px-1 py-1">
              <TaskListView tasks={thread.delegationTasks} />
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
});
