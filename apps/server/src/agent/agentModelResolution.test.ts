import { describe, expect, it } from "vitest";
import { resolveModelForAgent } from "./agentModelResolution";
import type { AgentDefinition, ProviderKind } from "@t3tools/contracts";

const makeAgent = (
  fallbackChain: { provider: ProviderKind; model: string }[],
): AgentDefinition =>
  ({
    id: "test-agent",
    name: "Test",
    description: "Test agent",
    mode: "primary",
    systemPrompt: "Test",
    modelFallbackChain: fallbackChain.map((entry) => ({
      provider: entry.provider,
      model: entry.model,
    })),
    delegationPolicy: { canDelegate: false },
  }) as any;

describe("resolveModelForAgent", () => {
  it("returns the first available provider from the fallback chain", () => {
    const agent = makeAgent([
      { provider: "claudeAgent", model: "claude-opus-4-6" },
      { provider: "codex", model: "gpt-5.4" },
    ]);
    const result = resolveModelForAgent(agent, ["codex"]);
    expect(result).toEqual({ provider: "codex", model: "gpt-5.4" });
  });

  it("returns the first entry when its provider is available", () => {
    const agent = makeAgent([
      { provider: "claudeAgent", model: "claude-opus-4-6" },
      { provider: "codex", model: "gpt-5.4" },
    ]);
    const result = resolveModelForAgent(agent, ["claudeAgent", "codex"]);
    expect(result).toEqual({ provider: "claudeAgent", model: "claude-opus-4-6" });
  });

  it("returns null when no provider in the chain is available", () => {
    const agent = makeAgent([
      { provider: "claudeAgent", model: "claude-opus-4-6" },
    ]);
    const result = resolveModelForAgent(agent, ["codex"]);
    expect(result).toBeNull();
  });

  it("returns null for empty fallback chain", () => {
    const agent = makeAgent([]);
    const result = resolveModelForAgent(agent, ["claudeAgent"]);
    expect(result).toBeNull();
  });

  it("returns null for empty available providers", () => {
    const agent = makeAgent([
      { provider: "claudeAgent", model: "claude-opus-4-6" },
    ]);
    const result = resolveModelForAgent(agent, []);
    expect(result).toBeNull();
  });

  it("passes through modelOptions when present", () => {
    const agent = makeAgent([]) as any;
    agent.modelFallbackChain = [
      {
        provider: "claudeAgent",
        model: "claude-opus-4-6",
        modelOptions: { claudeAgent: { effort: "high" } },
      },
    ];
    const result = resolveModelForAgent(agent, ["claudeAgent"]);
    expect(result).toEqual({
      provider: "claudeAgent",
      model: "claude-opus-4-6",
      modelOptions: { claudeAgent: { effort: "high" } },
    });
  });
});
