/**
 * DelegationCoordinator - Delegation batch lifecycle coordination service interface.
 *
 * Manages batch lifecycle including concurrency, dependency resolution,
 * and auto-continuation for delegated child threads.
 *
 * @module DelegationCoordinator
 */
import { Schema, ServiceMap } from "effect";
import type { Effect, Scope } from "effect";

export class DelegationCoordinatorError extends Schema.TaggedErrorClass<DelegationCoordinatorError>()(
  "DelegationCoordinatorError",
  { message: Schema.String },
) {}

export interface DelegationCoordinatorShape {
  /**
   * Start coordinating delegation batch lifecycle events.
   *
   * The returned effect must be run in a scope so all worker fibers can be
   * finalized on shutdown.
   */
  readonly start: Effect.Effect<void, never, Scope.Scope>;

  /**
   * Resolves when the internal processing queue is empty and idle.
   * Intended for test use to replace timing-sensitive sleeps.
   */
  readonly drain: Effect.Effect<void>;
}

export class DelegationCoordinator extends ServiceMap.Service<
  DelegationCoordinator,
  DelegationCoordinatorShape
>()("t3/orchestration/Services/DelegationCoordinator/DelegationCoordinator") {}
