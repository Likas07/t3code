import { ServiceMap } from "effect";
import type { Effect, Scope } from "effect";

export interface ThreadDelegationCoordinatorShape {
  readonly start: Effect.Effect<void, never, Scope.Scope>;
}

export class ThreadDelegationCoordinator extends ServiceMap.Service<
  ThreadDelegationCoordinator,
  ThreadDelegationCoordinatorShape
>()("t3/orchestration/Services/ThreadDelegationCoordinator") {}
