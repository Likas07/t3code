import {
  MessageId,
  type ChatAttachment,
  type OrchestrationCommand,
  type OrchestrationReadModel,
  type ThreadId,
} from "@t3tools/contracts";
import { Effect, FileSystem, Path } from "effect";

import {
  createAttachmentId,
  resolveAttachmentPath,
  resolveAttachmentPathById,
} from "../attachmentStore.ts";

function truncateTitle(text: string, maxLength = 50): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxLength)}...`;
}

function nextForkTitle(sourceTitle: string): string {
  return truncateTitle(`${sourceTitle} (fork)`);
}

export class ThreadForkMaterializationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ThreadForkMaterializationError";
  }
}

const cloneAttachment = Effect.fn(function* (input: {
  readonly destinationThreadId: ThreadId;
  readonly attachment: ChatAttachment;
  readonly stateDir: string;
  readonly fileSystem: FileSystem.FileSystem;
  readonly path: Path.Path;
}) {
  if (input.attachment.type !== "image") {
    return input.attachment;
  }

  const sourcePath = resolveAttachmentPathById({
    stateDir: input.stateDir,
    attachmentId: input.attachment.id,
  });
  if (!sourcePath) {
    return yield* Effect.fail(
      new ThreadForkMaterializationError(
        `Attachment '${input.attachment.id}' could not be resolved for forking.`,
      ),
    );
  }

  const sourceBytes = yield* input.fileSystem.readFile(sourcePath).pipe(
    Effect.mapError(
      () =>
        new ThreadForkMaterializationError(
          `Attachment '${input.attachment.id}' could not be read for forking.`,
        ),
    ),
  );

  const clonedAttachmentId = createAttachmentId(input.destinationThreadId);
  if (!clonedAttachmentId) {
    return yield* Effect.fail(
      new ThreadForkMaterializationError("Failed to create a safe attachment id for fork."),
    );
  }

  const clonedAttachment = {
    ...input.attachment,
    id: clonedAttachmentId,
  } satisfies ChatAttachment;

  const destinationPath = resolveAttachmentPath({
    stateDir: input.stateDir,
    attachment: clonedAttachment,
  });
  if (!destinationPath) {
    return yield* Effect.fail(
      new ThreadForkMaterializationError(
        `Attachment '${input.attachment.id}' could not be assigned a fork destination path.`,
      ),
    );
  }

  yield* input.fileSystem.makeDirectory(input.path.dirname(destinationPath), { recursive: true }).pipe(
    Effect.mapError(
      () =>
        new ThreadForkMaterializationError(
          `Attachment '${input.attachment.id}' destination directory could not be created.`,
        ),
    ),
  );
  yield* input.fileSystem.writeFile(destinationPath, sourceBytes).pipe(
    Effect.mapError(
      () =>
        new ThreadForkMaterializationError(
          `Attachment '${input.attachment.id}' could not be copied into the fork.`,
        ),
    ),
  );

  return clonedAttachment;
});

export const cloneThreadMessagesForDestination = Effect.fn(function* (input: {
  readonly destinationThreadId: ThreadId;
  readonly messages: ReadonlyArray<{
    readonly role: "user" | "assistant" | "system";
    readonly text: string;
    readonly attachments?: ReadonlyArray<ChatAttachment> | undefined;
    readonly createdAt: string;
    readonly updatedAt: string;
  }>;
  readonly stateDir: string;
  readonly fileSystem: FileSystem.FileSystem;
  readonly path: Path.Path;
}) {
  return yield* Effect.forEach(
    input.messages,
    (message) =>
      Effect.gen(function* () {
        const clonedAttachments = yield* Effect.forEach(
          message.attachments ?? [],
          (attachment) =>
            cloneAttachment({
              destinationThreadId: input.destinationThreadId,
              attachment,
              stateDir: input.stateDir,
              fileSystem: input.fileSystem,
              path: input.path,
            }),
          { concurrency: 1 },
        );

        return {
          messageId: MessageId.makeUnsafe(crypto.randomUUID()),
          role: message.role,
          text: message.text,
          attachments: clonedAttachments,
          createdAt: message.createdAt,
          updatedAt: message.updatedAt,
        };
      }),
    { concurrency: 1 },
  );
});

export const materializeSemanticThreadFork = Effect.fn(function* (input: {
  readonly readModel: OrchestrationReadModel;
  readonly sourceThreadId: ThreadId;
  readonly destinationThreadId: ThreadId;
  readonly commandId: OrchestrationCommand["commandId"];
  readonly createdAt: string;
  readonly stateDir: string;
  readonly fileSystem: FileSystem.FileSystem;
  readonly path: Path.Path;
}) {
  const sourceThread = input.readModel.threads.find(
    (thread) => thread.id === input.sourceThreadId && thread.deletedAt === null,
  );
  if (!sourceThread) {
    return yield* Effect.fail(
      new ThreadForkMaterializationError(
        `Source thread '${input.sourceThreadId}' does not exist or has been deleted.`,
      ),
    );
  }

  const destinationExists = input.readModel.threads.some((thread) => thread.id === input.destinationThreadId);
  if (destinationExists) {
    return yield* Effect.fail(
      new ThreadForkMaterializationError(
        `Destination thread '${input.destinationThreadId}' already exists.`,
      ),
    );
  }

  const messages = yield* cloneThreadMessagesForDestination({
    destinationThreadId: input.destinationThreadId,
    messages: sourceThread.messages,
    stateDir: input.stateDir,
    fileSystem: input.fileSystem,
    path: input.path,
  });

  return {
    type: "thread.fork.semantic.materialized",
    commandId: input.commandId,
    sourceThreadId: sourceThread.id,
    threadId: input.destinationThreadId,
    projectId: sourceThread.projectId,
    title: nextForkTitle(sourceThread.title),
    model: sourceThread.model,
    runtimeMode: sourceThread.runtimeMode,
    interactionMode: sourceThread.interactionMode,
    branch: sourceThread.branch,
    worktreePath: sourceThread.worktreePath,
    messages,
    createdAt: input.createdAt,
  } satisfies Extract<OrchestrationCommand, { type: "thread.fork.semantic.materialized" }>;
});
