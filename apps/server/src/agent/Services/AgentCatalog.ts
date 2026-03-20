import type { AgentCatalog, AgentDefinition, AgentId, AgentMode } from "@t3tools/contracts";
import type { ProviderKind } from "@t3tools/contracts";
import type { ProviderModelOptions } from "@t3tools/contracts";
import { ServiceMap } from "effect";
import type { Effect } from "effect";

export interface ResolvedAgentModel {
  readonly provider: ProviderKind;
  readonly model: string;
  readonly modelOptions?: ProviderModelOptions;
}

export interface AgentCatalogServiceShape {
  readonly getAgent: (agentId: AgentId) => Effect.Effect<AgentDefinition | null>;
  readonly listAgents: (filter?: { mode?: AgentMode }) => Effect.Effect<AgentDefinition[]>;
  readonly getCatalog: () => Effect.Effect<AgentCatalog>;
  readonly resolveModelForAgent: (
    agentId: AgentId,
    availableProviders: readonly ProviderKind[],
  ) => Effect.Effect<ResolvedAgentModel | null>;
}

export class AgentCatalogService extends ServiceMap.Service<
  AgentCatalogService,
  AgentCatalogServiceShape
>()("t3/agent/Services/AgentCatalog/AgentCatalogService") {}
