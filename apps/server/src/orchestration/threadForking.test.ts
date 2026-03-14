import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  CommandId,
  MessageId,
  ProjectId,
  ThreadId,
  type OrchestrationReadModel,
} from "@t3tools/contracts";
import { Effect, FileSystem, Path } from "effect";
import { afterEach, describe, expect, it } from "vitest";

import { resolveAttachmentPath } from "../attachmentStore.ts";
import { materializeSemanticThreadFork } from "./threadForking.ts";

const createdStateDirs = new Set<string>();

afterEach(() => {
  for (const stateDir of createdStateDirs) {
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
  createdStateDirs.clear();
});

function makeReadModel(input: {
  readonly sourceThreadId: ThreadId;
  readonly attachmentId?: string;
}): OrchestrationReadModel {
  return {
    snapshotSequence: 1,
    updatedAt: "2026-03-01T00:00:00.000Z",
    projects: [
      {
        id: ProjectId.makeUnsafe("project-1"),
        title: "Project",
        workspaceRoot: "/tmp/project",
        defaultModel: "gpt-5-codex",
        scripts: [],
        createdAt: "2026-03-01T00:00:00.000Z",
        updatedAt: "2026-03-01T00:00:00.000Z",
        deletedAt: null,
      },
    ],
    threads: [
      {
        id: input.sourceThreadId,
        projectId: ProjectId.makeUnsafe("project-1"),
        title: "Source thread",
        model: "gpt-5-codex",
        runtimeMode: "full-access",
        interactionMode: "default",
        branch: "feature/source",
        worktreePath: "/tmp/project/.worktree",
        latestTurn: null,
        fork: null,
        lineage: {
          rootThreadId: input.sourceThreadId,
          parentThreadId: null,
          delegationDepth: 0,
          role: "primary",
          parentBatchId: null,
          parentTaskIndex: null,
        },
        createdAt: "2026-03-01T00:00:00.000Z",
        updatedAt: "2026-03-01T00:00:00.000Z",
        deletedAt: null,
        messages: [
          {
            id: MessageId.makeUnsafe("message-user-1"),
            role: "user",
            text: "Look at this screenshot",
            attachments:
              input.attachmentId === undefined
                ? []
                : [
                    {
                      type: "image",
                      id: input.attachmentId,
                      name: "screen.png",
                      mimeType: "image/png",
                      sizeBytes: 5,
                    },
                  ],
            turnId: null,
            origin: "native",
            streaming: false,
            createdAt: "2026-03-01T00:00:01.000Z",
            updatedAt: "2026-03-01T00:00:01.000Z",
          },
          {
            id: MessageId.makeUnsafe("message-assistant-1"),
            role: "assistant",
            text: "I see the error",
            turnId: null,
            origin: "native",
            streaming: false,
            createdAt: "2026-03-01T00:00:02.000Z",
            updatedAt: "2026-03-01T00:00:02.000Z",
          },
        ],
        delegationBatches: [],
        proposedPlans: [],
        activities: [],
        checkpoints: [],
        session: null,
      },
    ],
  };
}

describe("materializeSemanticThreadFork", () => {
  it("copies messages and clones image attachments for the destination thread", async () => {
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "t3code-fork-"));
    createdStateDirs.add(stateDir);
    const sourceThreadId = ThreadId.makeUnsafe("thread-source");
    const destinationThreadId = ThreadId.makeUnsafe("thread-destination");
    const sourceAttachmentId = "thread-source-00000000-0000-4000-8000-000000000001";
    const sourceAttachment = {
      type: "image" as const,
      id: sourceAttachmentId,
      name: "screen.png",
      mimeType: "image/png",
      sizeBytes: 5,
    };
    const sourceAttachmentPath = resolveAttachmentPath({ stateDir, attachment: sourceAttachment });
    if (!sourceAttachmentPath) {
      throw new Error("Failed to resolve source attachment path.");
    }
    fs.mkdirSync(path.dirname(sourceAttachmentPath), { recursive: true });
    fs.writeFileSync(sourceAttachmentPath, Buffer.from("hello"));

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const effectPath = yield* Path.Path;
        return yield* materializeSemanticThreadFork({
          readModel: makeReadModel({
            sourceThreadId,
            attachmentId: sourceAttachmentId,
          }),
          sourceThreadId,
          destinationThreadId,
          commandId: CommandId.makeUnsafe("cmd-fork-1"),
          createdAt: "2026-03-01T00:00:03.000Z",
          stateDir,
          fileSystem,
          path: effectPath,
        });
      }).pipe(Effect.provide(NodeServices.layer)),
    );

    expect(result.type).toBe("thread.fork.semantic.materialized");
    expect(result.threadId).toBe(destinationThreadId);
    expect(result.title).toBe("Source thread (fork)");
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]?.attachments).toHaveLength(1);
    const clonedAttachment = result.messages[0]?.attachments[0];
    expect(clonedAttachment?.id).not.toBe(sourceAttachmentId);
    expect(clonedAttachment?.id.startsWith("thread-destination-")).toBe(true);
    const clonedAttachmentPath =
      clonedAttachment &&
      resolveAttachmentPath({
        stateDir,
        attachment: clonedAttachment,
      });
    expect(clonedAttachmentPath).not.toBeNull();
    expect(fs.readFileSync(clonedAttachmentPath!, "utf8")).toBe("hello");
  });

  it("fails when a source attachment file cannot be read", async () => {
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "t3code-fork-missing-"));
    createdStateDirs.add(stateDir);

    await expect(
      Effect.runPromise(
        Effect.gen(function* () {
          const fileSystem = yield* FileSystem.FileSystem;
          const effectPath = yield* Path.Path;
          return yield* materializeSemanticThreadFork({
            readModel: makeReadModel({
              sourceThreadId: ThreadId.makeUnsafe("thread-source"),
              attachmentId: "thread-source-00000000-0000-4000-8000-000000000099",
            }),
            sourceThreadId: ThreadId.makeUnsafe("thread-source"),
            destinationThreadId: ThreadId.makeUnsafe("thread-fork"),
            commandId: CommandId.makeUnsafe("cmd-fork-2"),
            createdAt: "2026-03-01T00:00:03.000Z",
            stateDir,
            fileSystem,
            path: effectPath,
          });
        }).pipe(Effect.provide(NodeServices.layer)),
      ),
    ).rejects.toThrow("could not be resolved");
  });
});
