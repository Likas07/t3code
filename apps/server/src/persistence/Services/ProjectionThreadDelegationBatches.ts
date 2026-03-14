import {
  DelegationBatchStatus,
  DelegationWorkspaceMode,
  IsoDateTime,
  NonNegativeInt,
  ThreadId,
  TurnId,
} from "@t3tools/contracts";
import { Schema, ServiceMap } from "effect";
import type { Effect } from "effect";

import type { ProjectionRepositoryError } from "../Errors.ts";

export const ProjectionThreadDelegationBatch = Schema.Struct({
  batchId: Schema.String,
  parentThreadId: ThreadId,
  parentTurnId: Schema.NullOr(TurnId),
  workspaceMode: DelegationWorkspaceMode,
  concurrencyLimit: NonNegativeInt,
  status: DelegationBatchStatus,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  completedAt: Schema.NullOr(IsoDateTime),
});
export type ProjectionThreadDelegationBatch = typeof ProjectionThreadDelegationBatch.Type;

export const ListProjectionThreadDelegationBatchesInput = Schema.Struct({
  parentThreadId: ThreadId,
});
export type ListProjectionThreadDelegationBatchesInput =
  typeof ListProjectionThreadDelegationBatchesInput.Type;

export const DeleteProjectionThreadDelegationBatchesInput = Schema.Struct({
  parentThreadId: ThreadId,
});
export type DeleteProjectionThreadDelegationBatchesInput =
  typeof DeleteProjectionThreadDelegationBatchesInput.Type;

export interface ProjectionThreadDelegationBatchRepositoryShape {
  readonly upsert: (
    row: ProjectionThreadDelegationBatch,
  ) => Effect.Effect<void, ProjectionRepositoryError>;
  readonly listByParentThreadId: (
    input: ListProjectionThreadDelegationBatchesInput,
  ) => Effect.Effect<ReadonlyArray<ProjectionThreadDelegationBatch>, ProjectionRepositoryError>;
  readonly deleteByParentThreadId: (
    input: DeleteProjectionThreadDelegationBatchesInput,
  ) => Effect.Effect<void, ProjectionRepositoryError>;
}

export class ProjectionThreadDelegationBatchRepository extends ServiceMap.Service<
  ProjectionThreadDelegationBatchRepository,
  ProjectionThreadDelegationBatchRepositoryShape
>()("t3/persistence/Services/ProjectionThreadDelegationBatches/ProjectionThreadDelegationBatchRepository") {}
