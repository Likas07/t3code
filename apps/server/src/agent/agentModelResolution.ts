import type { AgentDefinition, ProviderKind, ProviderModelOptions } from "@t3tools/contracts";

export interface ResolvedAgentModel {
  readonly provider: ProviderKind;
  readonly model: string;
  readonly modelOptions?: ProviderModelOptions;
}

/**
 * Resolve the best available model for an agent by iterating its fallback chain
 * and returning the first entry whose provider is in the available list.
 */
export function resolveModelForAgent(
  agent: AgentDefinition,
  availableProviders: readonly ProviderKind[],
): ResolvedAgentModel | null {
  const available = new Set(availableProviders);

  for (const entry of agent.modelFallbackChain) {
    if (available.has(entry.provider)) {
      const result: ResolvedAgentModel = {
        provider: entry.provider,
        model: entry.model,
      };
      if (entry.modelOptions !== undefined) {
        return { ...result, modelOptions: entry.modelOptions };
      }
      return result;
    }
  }

  return null;
}
