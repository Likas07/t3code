/**
 * DelegationReactor - Delegation event reaction service interface.
 *
 * Reacts to domain events related to delegation child thread completion
 * and dispatches delegation lifecycle commands.
 *
 * @module DelegationReactor
 */
import { ServiceMap } from "effect";
import type { Effect, Scope } from "effect";

export interface DelegationReactorShape {
  /**
   * Start reacting to delegation-related domain events.
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

export class DelegationReactor extends ServiceMap.Service<
  DelegationReactor,
  DelegationReactorShape
>()("t3/orchestration/Services/DelegationReactor/DelegationReactor") {}
