import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

    it("loads librarian.yaml and validates all fields", () => {
      const yamlPath = resolve(__dirname, "../../../../agents/librarian.yaml");
      const yamlContent = readFileSync(yamlPath, "utf-8");
      const result = loadAgentDefinitionsFromYaml(yamlContent);

      expect(result).toHaveLength(1);
      const librarian = result[0]!;

      // Identity
      expect(librarian.id).toBe("librarian");
      expect(librarian.name).toBe("Librarian");
      expect(librarian.mode).toBe("subagent");
      expect(librarian.description).toContain("documentation");

      // System prompt contains core constraints
      expect(librarian.systemPrompt).toContain("CANNOT write or edit files");
      expect(librarian.systemPrompt).toContain("Request Classification");

      // Model fallback chain
      expect(librarian.modelFallbackChain).toHaveLength(2);
      expect(librarian.modelFallbackChain[0]!.provider).toBe("claudeAgent");
      expect(librarian.modelFallbackChain[1]!.provider).toBe("codex");

      // Tool policy blocks destructive tools
      expect(librarian.toolPolicy?.restriction).toBe("block");
      expect(librarian.toolPolicy?.tools).toContain("write");
      expect(librarian.toolPolicy?.tools).toContain("edit");
      expect(librarian.toolPolicy?.tools).toContain("apply_patch");
      expect(librarian.toolPolicy?.tools).toContain("task");

      // Delegation policy — cannot delegate
      expect(librarian.delegationPolicy.canDelegate).toBe(false);

      // Tags
      expect(librarian.tags).toEqual(
        expect.arrayContaining(["research", "subagent", "read-only"]),
      );
    });

    it("loads hephaestus.yaml and validates all fields", () => {
      const yamlPath = resolve(__dirname, "../../../../agents/hephaestus.yaml");
      const yamlContent = readFileSync(yamlPath, "utf-8");
      const result = loadAgentDefinitionsFromYaml(yamlContent);

      expect(result).toHaveLength(1);
      const hephaestus = result[0]!;

      // Identity
      expect(hephaestus.id).toBe("hephaestus");
      expect(hephaestus.name).toBe("Hephaestus");
      expect(hephaestus.mode).toBe("primary");
      expect(hephaestus.description).toContain("Autonomous deep worker");

      // System prompt contains core constraints
      expect(hephaestus.systemPrompt).toContain("Measure twice, cut once");
      expect(hephaestus.systemPrompt).toContain("Context Gathering");
      expect(hephaestus.systemPrompt).toContain("Implement End-to-End");
      expect(hephaestus.systemPrompt).toContain("Verify Thoroughly");
      expect(hephaestus.systemPrompt).toContain("Do NOT delegate implementation");

      // Model fallback chain
      expect(hephaestus.modelFallbackChain).toHaveLength(2);
      expect(hephaestus.modelFallbackChain[0]!.provider).toBe("codex");
      expect(hephaestus.modelFallbackChain[0]!.model).toBe("gpt-5.4");
      expect(hephaestus.modelFallbackChain[1]!.provider).toBe("claudeAgent");
      expect(hephaestus.modelFallbackChain[1]!.model).toBe("claude-opus-4-6");

      // Delegation policy — can delegate to research agents only
      expect(hephaestus.delegationPolicy.canDelegate).toBe(true);
      expect(hephaestus.delegationPolicy.allowedSubAgents).toEqual(
        expect.arrayContaining(["explore", "librarian", "oracle", "multimodal-looker"]),
      );
      expect(hephaestus.delegationPolicy.maxDepth).toBe(1);

      // No tool policy (implementer has full access)
      expect(hephaestus.toolPolicy).toBeUndefined();

      // Tags
      expect(hephaestus.tags).toEqual(
        expect.arrayContaining(["implementer", "primary", "autonomous"]),
      );
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
