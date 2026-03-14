import type { DelegationBatchStatus, DelegationWorkspaceMode } from "@t3tools/contracts";

export const DELEGATE_THREADS_TOOL_NAME = "delegate_threads";
export const MAX_DELEGATION_TASKS = 6;
export const MAX_DELEGATION_CONCURRENCY = 3;
export const DELEGATE_THREADS_TOOL_DESCRIPTION =
  "Use this when a task can be split into independent sub-tasks. Prefer this tool for multi-step work that can run as parallel, independent sub-tasks, especially when each sub-task has clear ownership or can be completed without blocking the others. Do not use it for tiny tasks or work that must stay tightly coupled in one thread. Return a short delegation plan by providing 1-N concrete tasks with titles and prompts.";

export interface CodexDynamicToolSpec {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: {
      tasks: {
        type: "array";
        minItems: 1;
        maxItems: typeof MAX_DELEGATION_TASKS;
        items: {
          type: "object";
          properties: {
            title: {
              type: "string";
              minLength: 1;
            };
            prompt: {
              type: "string";
              minLength: 1;
            };
          };
          required: ["title", "prompt"];
          additionalProperties: false;
        };
      };
      workspaceMode: {
        type: "string";
        enum: ["same-worktree", "separate-worktree"];
      };
      concurrencyLimit: {
        type: "integer";
        minimum: 1;
        maximum: typeof MAX_DELEGATION_CONCURRENCY;
      };
    };
    required: ["tasks"];
    additionalProperties: false;
  };
  deferLoading: false;
}

interface DelegateThreadsToolChildSummary {
  childThreadId: string;
  title: string;
  status: "queued" | "running" | "blocked" | "completed" | "failed" | "cancelled";
  branch: string | null;
  worktreePath: string | null;
}

interface DelegateThreadsToolSuccessPayload {
  batchId: string;
  status: DelegationBatchStatus;
  workspaceMode: DelegationWorkspaceMode;
  children: ReadonlyArray<DelegateThreadsToolChildSummary>;
}

interface CodexDynamicToolCallResult {
  contentItems: Array<
    | {
        type: "inputText";
        text: string;
      }
    | {
        type: "inputImage";
        imageUrl: string;
      }
  >;
  success: boolean;
}

export function buildDelegateThreadsDynamicToolSpec(): CodexDynamicToolSpec {
  return {
    name: DELEGATE_THREADS_TOOL_NAME,
    description: DELEGATE_THREADS_TOOL_DESCRIPTION,
    inputSchema: {
      type: "object",
      properties: {
        tasks: {
          type: "array",
          minItems: 1,
          maxItems: MAX_DELEGATION_TASKS,
          items: {
            type: "object",
            properties: {
              title: {
                type: "string",
                minLength: 1,
              },
              prompt: {
                type: "string",
                minLength: 1,
              },
            },
            required: ["title", "prompt"],
            additionalProperties: false,
          },
        },
        workspaceMode: {
          type: "string",
          enum: ["same-worktree", "separate-worktree"],
        },
        concurrencyLimit: {
          type: "integer",
          minimum: 1,
          maximum: MAX_DELEGATION_CONCURRENCY,
        },
      },
      required: ["tasks"],
      additionalProperties: false,
    },
    deferLoading: false,
  };
}

export function createDelegateThreadsToolSuccessResult(
  payload: DelegateThreadsToolSuccessPayload,
): CodexDynamicToolCallResult {
  return {
    contentItems: [
      {
        type: "inputText",
        text: JSON.stringify(payload, null, 2),
      },
    ],
    success: true,
  };
}

export function createDelegateThreadsToolFailureResult(error: string): CodexDynamicToolCallResult {
  return {
    contentItems: [
      {
        type: "inputText",
        text: JSON.stringify(
          {
            status: "failed",
            error,
          },
          null,
          2,
        ),
      },
    ],
    success: false,
  };
}
