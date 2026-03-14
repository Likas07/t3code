import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";
import { Effect, Layer } from "effect";

import { toPersistenceSqlError } from "../Errors.ts";
import {
  DeleteProjectionThreadInput,
  GetProjectionThreadInput,
  ListProjectionThreadsByProjectInput,
  ProjectionThread,
  ProjectionThreadRepository,
  type ProjectionThreadRepositoryShape,
} from "../Services/ProjectionThreads.ts";

const makeProjectionThreadRepository = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const upsertProjectionThreadRow = SqlSchema.void({
    Request: ProjectionThread,
    execute: (row) =>
      sql`
        INSERT INTO projection_threads (
          thread_id,
          project_id,
          title,
          model,
          runtime_mode,
          interaction_mode,
          branch,
          worktree_path,
          latest_turn_id,
          fork_kind,
          fork_source_thread_id,
          fork_bootstrap_status,
          fork_imported_message_count,
          fork_created_at,
          fork_bootstrapped_at,
          root_thread_id,
          parent_thread_id,
          delegation_depth,
          delegation_role,
          parent_batch_id,
          parent_task_index,
          created_at,
          updated_at,
          deleted_at
        )
        VALUES (
          ${row.threadId},
          ${row.projectId},
          ${row.title},
          ${row.model},
          ${row.runtimeMode},
          ${row.interactionMode},
          ${row.branch},
          ${row.worktreePath},
          ${row.latestTurnId},
          ${row.forkKind},
          ${row.forkSourceThreadId},
          ${row.forkBootstrapStatus},
          ${row.forkImportedMessageCount},
          ${row.forkCreatedAt},
          ${row.forkBootstrappedAt},
          ${row.rootThreadId},
          ${row.parentThreadId},
          ${row.delegationDepth},
          ${row.delegationRole},
          ${row.parentBatchId},
          ${row.parentTaskIndex},
          ${row.createdAt},
          ${row.updatedAt},
          ${row.deletedAt}
        )
        ON CONFLICT (thread_id)
        DO UPDATE SET
          project_id = excluded.project_id,
          title = excluded.title,
          model = excluded.model,
          runtime_mode = excluded.runtime_mode,
          interaction_mode = excluded.interaction_mode,
          branch = excluded.branch,
          worktree_path = excluded.worktree_path,
          latest_turn_id = excluded.latest_turn_id,
          fork_kind = excluded.fork_kind,
          fork_source_thread_id = excluded.fork_source_thread_id,
          fork_bootstrap_status = excluded.fork_bootstrap_status,
          fork_imported_message_count = excluded.fork_imported_message_count,
          fork_created_at = excluded.fork_created_at,
          fork_bootstrapped_at = excluded.fork_bootstrapped_at,
          root_thread_id = excluded.root_thread_id,
          parent_thread_id = excluded.parent_thread_id,
          delegation_depth = excluded.delegation_depth,
          delegation_role = excluded.delegation_role,
          parent_batch_id = excluded.parent_batch_id,
          parent_task_index = excluded.parent_task_index,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at,
          deleted_at = excluded.deleted_at
      `,
  });

  const getProjectionThreadRow = SqlSchema.findOneOption({
    Request: GetProjectionThreadInput,
    Result: ProjectionThread,
    execute: ({ threadId }) =>
      sql`
        SELECT
          thread_id AS "threadId",
          project_id AS "projectId",
          title,
          model,
          runtime_mode AS "runtimeMode",
          interaction_mode AS "interactionMode",
          branch,
          worktree_path AS "worktreePath",
          latest_turn_id AS "latestTurnId",
          fork_kind AS "forkKind",
          fork_source_thread_id AS "forkSourceThreadId",
          fork_bootstrap_status AS "forkBootstrapStatus",
          fork_imported_message_count AS "forkImportedMessageCount",
          fork_created_at AS "forkCreatedAt",
          fork_bootstrapped_at AS "forkBootstrappedAt",
          root_thread_id AS "rootThreadId",
          parent_thread_id AS "parentThreadId",
          delegation_depth AS "delegationDepth",
          delegation_role AS "delegationRole",
          parent_batch_id AS "parentBatchId",
          parent_task_index AS "parentTaskIndex",
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          deleted_at AS "deletedAt"
        FROM projection_threads
        WHERE thread_id = ${threadId}
      `,
  });

  const listProjectionThreadRows = SqlSchema.findAll({
    Request: ListProjectionThreadsByProjectInput,
    Result: ProjectionThread,
    execute: ({ projectId }) =>
      sql`
        SELECT
          thread_id AS "threadId",
          project_id AS "projectId",
          title,
          model,
          runtime_mode AS "runtimeMode",
          interaction_mode AS "interactionMode",
          branch,
          worktree_path AS "worktreePath",
          latest_turn_id AS "latestTurnId",
          fork_kind AS "forkKind",
          fork_source_thread_id AS "forkSourceThreadId",
          fork_bootstrap_status AS "forkBootstrapStatus",
          fork_imported_message_count AS "forkImportedMessageCount",
          fork_created_at AS "forkCreatedAt",
          fork_bootstrapped_at AS "forkBootstrappedAt",
          root_thread_id AS "rootThreadId",
          parent_thread_id AS "parentThreadId",
          delegation_depth AS "delegationDepth",
          delegation_role AS "delegationRole",
          parent_batch_id AS "parentBatchId",
          parent_task_index AS "parentTaskIndex",
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          deleted_at AS "deletedAt"
        FROM projection_threads
        WHERE project_id = ${projectId}
        ORDER BY created_at ASC, thread_id ASC
      `,
  });

  const deleteProjectionThreadRow = SqlSchema.void({
    Request: DeleteProjectionThreadInput,
    execute: ({ threadId }) =>
      sql`
        DELETE FROM projection_threads
        WHERE thread_id = ${threadId}
      `,
  });

  const upsert: ProjectionThreadRepositoryShape["upsert"] = (row) =>
    upsertProjectionThreadRow(row).pipe(
      Effect.mapError(toPersistenceSqlError("ProjectionThreadRepository.upsert:query")),
    );

  const getById: ProjectionThreadRepositoryShape["getById"] = (input) =>
    getProjectionThreadRow(input).pipe(
      Effect.mapError(toPersistenceSqlError("ProjectionThreadRepository.getById:query")),
    );

  const listByProjectId: ProjectionThreadRepositoryShape["listByProjectId"] = (input) =>
    listProjectionThreadRows(input).pipe(
      Effect.mapError(toPersistenceSqlError("ProjectionThreadRepository.listByProjectId:query")),
    );

  const deleteById: ProjectionThreadRepositoryShape["deleteById"] = (input) =>
    deleteProjectionThreadRow(input).pipe(
      Effect.mapError(toPersistenceSqlError("ProjectionThreadRepository.deleteById:query")),
    );

  return {
    upsert,
    getById,
    listByProjectId,
    deleteById,
  } satisfies ProjectionThreadRepositoryShape;
});

export const ProjectionThreadRepositoryLive = Layer.effect(
  ProjectionThreadRepository,
  makeProjectionThreadRepository,
);
