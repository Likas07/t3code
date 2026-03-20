import { AgentId, TaskId } from "@t3tools/contracts";

export function createPlanningPipelineBatch(input: {
  planRequest: string;
}) {
  const now = Date.now();
  const prometheusTaskId = TaskId.makeUnsafe(`task-prometheus-${now}`);
  const metisTaskId = TaskId.makeUnsafe(`task-metis-${now}`);
  const momusTaskId = TaskId.makeUnsafe(`task-momus-${now}`);

  return {
    children: [
      {
        agentId: AgentId.makeUnsafe("prometheus"),
        taskId: prometheusTaskId,
        subject: `Plan: ${input.planRequest.slice(0, 80)}`,
        description: "Strategic planning phase",
        prompt: `Create a comprehensive work plan for:\n\n${input.planRequest}`,
        blockedBy: [] as TaskId[],
      },
      {
        agentId: AgentId.makeUnsafe("metis"),
        taskId: metisTaskId,
        subject: `Analysis: ${input.planRequest.slice(0, 60)}`,
        description: "Pre-planning gap analysis",
        prompt: `Analyze the plan for gaps, risks, and ambiguities.`,
        blockedBy: [prometheusTaskId],
      },
      {
        agentId: AgentId.makeUnsafe("momus"),
        taskId: momusTaskId,
        subject: `Review: ${input.planRequest.slice(0, 60)}`,
        description: "Plan quality review",
        prompt: `Review the plan and analysis. Approve (OKAY) or reject (REJECT) with specific blockers.`,
        blockedBy: [metisTaskId],
      },
    ],
  };
}
