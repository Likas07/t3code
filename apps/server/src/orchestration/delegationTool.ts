/**
 * delegationTool - Utility module that translates delegation requests from
 * provider adapters into orchestration commands.
 *
 * This is NOT a virtual tool injected into the LLM — it is a mapper function
 * used by the adapters and by ProviderRuntimeIngestion to convert delegation-
 * related runtime events into `delegation.batch.start` commands.
 *
 * @module delegationTool
 */
import { AgentId, CommandId, DelegationBatchId, TaskId, ThreadId } from "@t3tools/contracts";
import type { OrchestrationCommand } from "@t3tools/contracts";

export interface DelegationRequest {
  parentThreadId: ThreadId;
  agentId: string;
  subject: string;
  description: string;
  prompt: string;
}

export function buildDelegationBatchCommand(
  parentThreadId: ThreadId,
  requests: DelegationRequest[],
): Extract<OrchestrationCommand, { type: "delegation.batch.start" }> {
  const now = new Date().toISOString();
  return {
    type: "delegation.batch.start",
    commandId: CommandId.makeUnsafe(`cmd-delegation-${Date.now()}`),
    threadId: parentThreadId,
    delegationId: DelegationBatchId.makeUnsafe(`batch-${Date.now()}`),
    children: requests.map((req) => ({
      childThreadId: ThreadId.makeUnsafe(
        `child-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ),
      taskId: TaskId.makeUnsafe(`task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
      agentId: AgentId.makeUnsafe(req.agentId),
      subject: req.subject,
      description: req.description,
    })),
    createdAt: now,
  };
}
