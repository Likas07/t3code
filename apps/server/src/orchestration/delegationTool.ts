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
import type { DelegationExecutionMode, OrchestrationCommand } from "@t3tools/contracts";

export interface DelegationRequest {
  parentThreadId: ThreadId;
  agentId: string;
  subject: string;
  description: string;
  prompt: string;
  model?: string;
}

export interface DelegationBatchOptions {
  executionMode?: DelegationExecutionMode;
}

export function buildDelegationBatchCommand(
  parentThreadId: ThreadId,
  requests: DelegationRequest[],
  options?: DelegationBatchOptions,
): Extract<OrchestrationCommand, { type: "delegation.batch.start" }> {
  const now = new Date().toISOString();
  const uid = () => crypto.randomUUID().slice(0, 8);
  return {
    type: "delegation.batch.start",
    commandId: CommandId.makeUnsafe(`cmd-delegation-${uid()}`),
    threadId: parentThreadId,
    delegationId: DelegationBatchId.makeUnsafe(`batch-${uid()}`),
    ...(options?.executionMode ? { executionMode: options.executionMode } : {}),
    children: requests.map((req) => ({
      childThreadId: ThreadId.makeUnsafe(`child-${uid()}`),
      taskId: TaskId.makeUnsafe(`task-${uid()}`),
      agentId: AgentId.makeUnsafe(req.agentId),
      subject: req.subject,
      description: req.description,
      prompt: req.prompt,
      ...(req.model ? { model: req.model } : {}),
    })),
    createdAt: now,
  };
}
