import { MessageId, type ThreadId } from "@t3tools/contracts";

export function buildDelegationBootstrapMessages(input: {
  readonly parentThreadId: ThreadId;
  readonly parentThreadTitle: string;
  readonly branch: string | null;
  readonly worktreePath: string | null;
  readonly createdAt: string;
}) {
  const details = [
    `Parent thread title: ${input.parentThreadTitle}`,
    `Parent thread id: ${input.parentThreadId}`,
    input.branch ? `Parent branch: ${input.branch}` : null,
    input.worktreePath ? `Parent worktree: ${input.worktreePath}` : null,
  ]
    .filter((entry): entry is string => entry !== null)
    .join("\n");

  return [
    {
      messageId: MessageId.makeUnsafe(crypto.randomUUID()),
      role: "system" as const,
      text:
        "You are a delegated child thread. This thread intentionally starts with targeted context instead of the full parent conversation.\n" +
        "Focus only on the delegated task in the next user message. If critical context is missing, state exactly what is missing rather than guessing.\n\n" +
        details,
      attachments: [],
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    },
  ];
}
