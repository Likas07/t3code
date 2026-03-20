import { memo } from "react";
import { CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import { Badge } from "./ui/badge";
import type { Thread } from "../types";

function taskStatusIcon(status: string) {
  switch (status) {
    case "pending":
      return <Clock className="size-4 shrink-0 text-muted-foreground" />;
    case "in_progress":
      return <Loader2 className="size-4 shrink-0 animate-spin text-blue-500" />;
    case "completed":
      return <CheckCircle2 className="size-4 shrink-0 text-green-500" />;
    case "deleted":
      return <XCircle className="size-4 shrink-0 text-red-500" />;
    default:
      return <Clock className="size-4 shrink-0 text-muted-foreground" />;
  }
}

interface TaskListViewProps {
  tasks: Thread["delegationTasks"];
}

export const TaskListView = memo(function TaskListView({ tasks }: TaskListViewProps) {
  if (!tasks || tasks.length === 0) return null;

  return (
    <div className="flex flex-col gap-1">
      {tasks.map((task) => (
        <div key={task.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm">
          {taskStatusIcon(task.status)}
          <span className="truncate">{task.subject}</span>
          {task.owner && (
            <Badge variant="secondary" size="sm" className="ml-auto shrink-0">
              {task.owner}
            </Badge>
          )}
          {task.blockedBy.length > 0 && (
            <span className="ml-auto shrink-0 text-xs text-muted-foreground">Blocked</span>
          )}
        </div>
      ))}
    </div>
  );
});
