import { AgentDefinition, type AgentDefinition as AgentDefinitionType } from "@t3tools/contracts";
import { Schema } from "effect";
import YAML from "yaml";

/**
 * Parse a YAML string containing a single agent definition.
 * Returns an array of AgentDefinition (one per YAML document).
 * Throws if the YAML is invalid or doesn't match the schema.
 */
export function loadAgentDefinitionsFromYaml(yamlContent: string): AgentDefinitionType[] {
  const trimmed = yamlContent.trim();
  if (trimmed === "") return [];

  const parsed = YAML.parse(trimmed);
  if (parsed === null || parsed === undefined) return [];

  const decode = Schema.decodeUnknownSync(AgentDefinition);
  return [decode(parsed)];
}

/**
 * Merge multiple layers of agent definitions.
 * Later layers override earlier layers by agent `id`.
 * New agents from later layers are added.
 */
export function mergeAgentLayers(
  layers: readonly (readonly AgentDefinitionType[])[],
): AgentDefinitionType[] {
  const merged = new Map<string, AgentDefinitionType>();

  for (const layer of layers) {
    for (const agent of layer) {
      merged.set(agent.id, agent);
    }
  }

  return Array.from(merged.values());
}
