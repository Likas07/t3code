import {
  ApprovalRequestId,
  DelegationChildStatus,
  IsoDateTime,
  NonNegativeInt,
  ThreadId,
} from "@t3tools/contracts";
import { Schema, ServiceMap } from "effect";
import type { Effect } from "effect";

import type { ProjectionRepositoryError } from "../Errors.ts";

export const ProjectionThreadDelegationChild = Schema.Struct({
  batchId: Schema.String,
  parentThreadId: ThreadId,
  childThreadId: ThreadId,
  taskIndex: NonNegativeInt,
  title: Schema.String,
  prompt: Schema.String,
  status: DelegationChildStatus,
  branch: Schema.NullOr(Schema.String),
  worktreePath: Schema.NullOr(Schema.String),
  startedAt: Schema.NullOr(IsoDateTime),
  completedAt: Schema.NullOr(IsoDateTime),
  summary: Schema.NullOr(Schema.String),
  error: Schema.NullOr(Schema.String),
  blockingRequestId: Schema.NullOr(ApprovalRequestId),
  blockingKind: Schema.NullOr(Schema.Literals(["approval", "user-input"])),
  updatedAt: IsoDateTime,
});
export type ProjectionThreadDelegationChild = typeof ProjectionThreadDelegationChild.Type;

export const ListProjectionThreadDelegationChildrenInput = Schema.Struct({
  parentThreadId: ThreadId,
});
export type ListProjectionThreadDelegationChildrenInput =
  typeof ListProjectionThreadDelegationChildrenInput.Type;

export const DeleteProjectionThreadDelegationChildrenInput = Schema.Struct({
  parentThreadId: ThreadId,
});
export type DeleteProjectionThreadDelegationChildrenInput =
  typeof DeleteProjectionThreadDelegationChildrenInput.Type;

export interface ProjectionThreadDelegationChildRepositoryShape {
  readonly upsert: (
    row: ProjectionThreadDelegationChild,
  ) => Effect.Effect<void, ProjectionRepositoryError>;
  readonly listByParentThreadId: (
    input: ListProjectionThreadDelegationChildrenInput,
  ) => Effect.Effect<ReadonlyArray<ProjectionThreadDelegationChild>, ProjectionRepositoryError>;
  readonly deleteByParentThreadId: (
    input: DeleteProjectionThreadDelegationChildrenInput,
  ) => Effect.Effect<void, ProjectionRepositoryError>;
}

export class ProjectionThreadDelegationChildRepository extends ServiceMap.Service<
  ProjectionThreadDelegationChildRepository,
  ProjectionThreadDelegationChildRepositoryShape
>()(
  "t3/persistence/Services/ProjectionThreadDelegationChildren/ProjectionThreadDelegationChildRepository",
) {}
