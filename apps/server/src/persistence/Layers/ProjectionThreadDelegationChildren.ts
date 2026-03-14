import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";
import { Effect, Layer } from "effect";

import { toPersistenceSqlError } from "../Errors.ts";
import {
  DeleteProjectionThreadDelegationChildrenInput,
  ListProjectionThreadDelegationChildrenInput,
  ProjectionThreadDelegationChild,
  ProjectionThreadDelegationChildRepository,
  type ProjectionThreadDelegationChildRepositoryShape,
} from "../Services/ProjectionThreadDelegationChildren.ts";

const makeProjectionThreadDelegationChildRepository = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const upsertRow = SqlSchema.void({
    Request: ProjectionThreadDelegationChild,
    execute: (row) =>
      sql`
        INSERT INTO projection_thread_delegation_children (
          batch_id,
          parent_thread_id,
          child_thread_id,
          task_index,
          title,
          prompt,
          status,
          branch,
          worktree_path,
          started_at,
          completed_at,
          summary,
          error,
          blocking_request_id,
          blocking_kind,
          updated_at
        )
        VALUES (
          ${row.batchId},
          ${row.parentThreadId},
          ${row.childThreadId},
          ${row.taskIndex},
          ${row.title},
          ${row.prompt},
          ${row.status},
          ${row.branch},
          ${row.worktreePath},
          ${row.startedAt},
          ${row.completedAt},
          ${row.summary},
          ${row.error},
          ${row.blockingRequestId},
          ${row.blockingKind},
          ${row.updatedAt}
        )
        ON CONFLICT (child_thread_id)
        DO UPDATE SET
          batch_id = excluded.batch_id,
          parent_thread_id = excluded.parent_thread_id,
          task_index = excluded.task_index,
          title = excluded.title,
          prompt = excluded.prompt,
          status = excluded.status,
          branch = excluded.branch,
          worktree_path = excluded.worktree_path,
          started_at = excluded.started_at,
          completed_at = excluded.completed_at,
          summary = excluded.summary,
          error = excluded.error,
          blocking_request_id = excluded.blocking_request_id,
          blocking_kind = excluded.blocking_kind,
          updated_at = excluded.updated_at
      `,
  });

  const listRows = SqlSchema.findAll({
    Request: ListProjectionThreadDelegationChildrenInput,
    Result: ProjectionThreadDelegationChild,
    execute: ({ parentThreadId }) =>
      sql`
        SELECT
          batch_id AS "batchId",
          parent_thread_id AS "parentThreadId",
          child_thread_id AS "childThreadId",
          task_index AS "taskIndex",
          title,
          prompt,
          status,
          branch,
          worktree_path AS "worktreePath",
          started_at AS "startedAt",
          completed_at AS "completedAt",
          summary,
          error,
          blocking_request_id AS "blockingRequestId",
          blocking_kind AS "blockingKind",
          updated_at AS "updatedAt"
        FROM projection_thread_delegation_children
        WHERE parent_thread_id = ${parentThreadId}
        ORDER BY batch_id ASC, task_index ASC, child_thread_id ASC
      `,
  });

  const deleteRows = SqlSchema.void({
    Request: DeleteProjectionThreadDelegationChildrenInput,
    execute: ({ parentThreadId }) =>
      sql`
        DELETE FROM projection_thread_delegation_children
        WHERE parent_thread_id = ${parentThreadId}
      `,
  });

  const upsert: ProjectionThreadDelegationChildRepositoryShape["upsert"] = (row) =>
    upsertRow(row).pipe(
      Effect.mapError(
        toPersistenceSqlError("ProjectionThreadDelegationChildRepository.upsert:query"),
      ),
    );

  const listByParentThreadId: ProjectionThreadDelegationChildRepositoryShape["listByParentThreadId"] =
    (input) =>
      listRows(input).pipe(
        Effect.mapError(
          toPersistenceSqlError("ProjectionThreadDelegationChildRepository.listByParentThreadId:query"),
        ),
      );

  const deleteByParentThreadId: ProjectionThreadDelegationChildRepositoryShape["deleteByParentThreadId"] =
    (input) =>
      deleteRows(input).pipe(
        Effect.mapError(
          toPersistenceSqlError("ProjectionThreadDelegationChildRepository.deleteByParentThreadId:query"),
        ),
      );

  return {
    upsert,
    listByParentThreadId,
    deleteByParentThreadId,
  } satisfies ProjectionThreadDelegationChildRepositoryShape;
});

export const ProjectionThreadDelegationChildRepositoryLive = Layer.effect(
  ProjectionThreadDelegationChildRepository,
  makeProjectionThreadDelegationChildRepository,
);
