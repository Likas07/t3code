import { describe, expect, it } from "vitest";
import { loadAgentDefinitionsFromYaml, mergeAgentLayers } from "./agentCatalogLoader";
import type { AgentDefinition } from "@t3tools/contracts";

describe("agentCatalogLoader", () => {
  describe("loadAgentDefinitionsFromYaml", () => {
    it("parses a valid agent YAML string into an AgentDefinition", () => {
      const yaml = `
id: explore
name: Explore
description: Internal codebase search agent
mode: subagent
systemPrompt: "You are a codebase search specialist."
modelFallbackChain:
  - provider: claudeAgent
    model: claude-sonnet-4-6
delegationPolicy:
  canDelegate: false
toolPolicy:
  restriction: block
  tools:
    - write
    - edit
`;
      const result = loadAgentDefinitionsFromYaml(yaml);
      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe("explore");
      expect(result[0]!.mode).toBe("subagent");
      expect(result[0]!.delegationPolicy.canDelegate).toBe(false);
      expect(result[0]!.toolPolicy?.restriction).toBe("block");
      expect(result[0]!.toolPolicy?.tools).toEqual(["write", "edit"]);
      expect(result[0]!.modelFallbackChain).toHaveLength(1);
      expect(result[0]!.modelFallbackChain[0]!.provider).toBe("claudeAgent");
    });

    it("parses YAML with multiple agents separated by document markers", () => {
      const yaml = `
id: explore
name: Explore
description: Codebase search
mode: subagent
systemPrompt: "Search specialist"
modelFallbackChain:
  - provider: claudeAgent
    model: claude-sonnet-4-6
delegationPolicy:
  canDelegate: false
`;
      // Single doc = single agent
      const result = loadAgentDefinitionsFromYaml(yaml);
      expect(result).toHaveLength(1);
    });

    it("returns empty array for empty YAML", () => {
      const result = loadAgentDefinitionsFromYaml("");
      expect(result).toEqual([]);
    });

    it("throws on invalid YAML that does not match schema", () => {
      const yaml = `
id: bad-agent
name: Bad
`;
      expect(() => loadAgentDefinitionsFromYaml(yaml)).toThrow();
    });
  });

  describe("mergeAgentLayers", () => {
    const baseAgent: AgentDefinition = {
      id: "explore" as any,
      name: "Explore" as any,
      description: "Base explore" as any,
      mode: "subagent",
      systemPrompt: "Base prompt" as any,
      modelFallbackChain: [{ provider: "claudeAgent", model: "claude-sonnet-4-6" as any }],
      delegationPolicy: { canDelegate: false },
    };

    const overrideAgent: AgentDefinition = {
      id: "explore" as any,
      name: "Explore Override" as any,
      description: "Overridden explore" as any,
      mode: "subagent",
      systemPrompt: "Override prompt" as any,
      modelFallbackChain: [{ provider: "codex", model: "gpt-5.4" as any }],
      delegationPolicy: { canDelegate: false },
    };

    const otherAgent: AgentDefinition = {
      id: "oracle" as any,
      name: "Oracle" as any,
      description: "Read-only advisor" as any,
      mode: "subagent",
      systemPrompt: "Oracle prompt" as any,
      modelFallbackChain: [{ provider: "claudeAgent", model: "claude-opus-4-6" as any }],
      delegationPolicy: { canDelegate: false },
    };

    it("merges layers with later layers overriding earlier ones by id", () => {
      const result = mergeAgentLayers([[baseAgent], [overrideAgent]]);
      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe("Explore Override");
      expect(result[0]!.systemPrompt).toBe("Override prompt");
    });

    it("preserves agents from earlier layers that are not overridden", () => {
      const result = mergeAgentLayers([[baseAgent, otherAgent], [overrideAgent]]);
      expect(result).toHaveLength(2);
      const explore = result.find((a) => a.id === "explore");
      const oracle = result.find((a) => a.id === "oracle");
      expect(explore?.name).toBe("Explore Override");
      expect(oracle?.name).toBe("Oracle");
    });

    it("adds new agents from later layers", () => {
      const result = mergeAgentLayers([[baseAgent], [otherAgent]]);
      expect(result).toHaveLength(2);
    });

    it("handles empty layers", () => {
      const result = mergeAgentLayers([[], [baseAgent], []]);
      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe("explore");
    });

    it("handles no layers", () => {
      const result = mergeAgentLayers([]);
      expect(result).toEqual([]);
    });
  });
});
