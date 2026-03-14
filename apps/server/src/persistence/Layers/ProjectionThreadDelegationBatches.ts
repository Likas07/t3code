import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";
import { Effect, Layer } from "effect";

import { toPersistenceSqlError } from "../Errors.ts";
import {
  DeleteProjectionThreadDelegationBatchesInput,
  ListProjectionThreadDelegationBatchesInput,
  ProjectionThreadDelegationBatch,
  ProjectionThreadDelegationBatchRepository,
  type ProjectionThreadDelegationBatchRepositoryShape,
} from "../Services/ProjectionThreadDelegationBatches.ts";

const makeProjectionThreadDelegationBatchRepository = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const upsertRow = SqlSchema.void({
    Request: ProjectionThreadDelegationBatch,
    execute: (row) =>
      sql`
        INSERT INTO projection_thread_delegation_batches (
          batch_id,
          parent_thread_id,
          parent_turn_id,
          workspace_mode,
          concurrency_limit,
          status,
          created_at,
          updated_at,
          completed_at
        )
        VALUES (
          ${row.batchId},
          ${row.parentThreadId},
          ${row.parentTurnId},
          ${row.workspaceMode},
          ${row.concurrencyLimit},
          ${row.status},
          ${row.createdAt},
          ${row.updatedAt},
          ${row.completedAt}
        )
        ON CONFLICT (batch_id)
        DO UPDATE SET
          parent_thread_id = excluded.parent_thread_id,
          parent_turn_id = excluded.parent_turn_id,
          workspace_mode = excluded.workspace_mode,
          concurrency_limit = excluded.concurrency_limit,
          status = excluded.status,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at,
          completed_at = excluded.completed_at
      `,
  });

  const listRows = SqlSchema.findAll({
    Request: ListProjectionThreadDelegationBatchesInput,
    Result: ProjectionThreadDelegationBatch,
    execute: ({ parentThreadId }) =>
      sql`
        SELECT
          batch_id AS "batchId",
          parent_thread_id AS "parentThreadId",
          parent_turn_id AS "parentTurnId",
          workspace_mode AS "workspaceMode",
          concurrency_limit AS "concurrencyLimit",
          status,
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          completed_at AS "completedAt"
        FROM projection_thread_delegation_batches
        WHERE parent_thread_id = ${parentThreadId}
        ORDER BY created_at ASC, batch_id ASC
      `,
  });

  const deleteRows = SqlSchema.void({
    Request: DeleteProjectionThreadDelegationBatchesInput,
    execute: ({ parentThreadId }) =>
      sql`
        DELETE FROM projection_thread_delegation_batches
        WHERE parent_thread_id = ${parentThreadId}
      `,
  });

  const upsert: ProjectionThreadDelegationBatchRepositoryShape["upsert"] = (row) =>
    upsertRow(row).pipe(
      Effect.mapError(
        toPersistenceSqlError("ProjectionThreadDelegationBatchRepository.upsert:query"),
      ),
    );

  const listByParentThreadId: ProjectionThreadDelegationBatchRepositoryShape["listByParentThreadId"] =
    (input) =>
      listRows(input).pipe(
        Effect.mapError(
          toPersistenceSqlError(
            "ProjectionThreadDelegationBatchRepository.listByParentThreadId:query",
          ),
        ),
      );

  const deleteByParentThreadId: ProjectionThreadDelegationBatchRepositoryShape["deleteByParentThreadId"] =
    (input) =>
      deleteRows(input).pipe(
        Effect.mapError(
          toPersistenceSqlError(
            "ProjectionThreadDelegationBatchRepository.deleteByParentThreadId:query",
          ),
        ),
      );

  return {
    upsert,
    listByParentThreadId,
    deleteByParentThreadId,
  } satisfies ProjectionThreadDelegationBatchRepositoryShape;
});

export const ProjectionThreadDelegationBatchRepositoryLive = Layer.effect(
  ProjectionThreadDelegationBatchRepository,
  makeProjectionThreadDelegationBatchRepository,
);
