import { Schema } from "effect";
import { AgentId, TrimmedNonEmptyString } from "./baseSchemas";
import { ProviderKind } from "./orchestration";
import { ProviderModelOptions } from "./model";

// ── Agent Mode ──────────────────────────────────────────────────

export const AgentMode = Schema.Literals(["primary", "subagent"]);
export type AgentMode = typeof AgentMode.Type;

// ── Model Fallback Chain ────────────────────────────────────────

export const ModelFallbackEntry = Schema.Struct({
  provider: ProviderKind,
  model: TrimmedNonEmptyString,
  modelOptions: Schema.optional(ProviderModelOptions),
});
export type ModelFallbackEntry = typeof ModelFallbackEntry.Type;

// ── Tool Policy ─────────────────────────────────────────────────

export const AgentToolRestriction = Schema.Literals(["allow", "block"]);
export type AgentToolRestriction = typeof AgentToolRestriction.Type;

export const AgentToolPolicy = Schema.Struct({
  restriction: AgentToolRestriction,
  tools: Schema.Array(TrimmedNonEmptyString),
});
export type AgentToolPolicy = typeof AgentToolPolicy.Type;

// ── Delegation Policy ───────────────────────────────────────────

export const DelegationPolicy = Schema.Struct({
  canDelegate: Schema.Boolean,
  allowedSubAgents: Schema.optional(Schema.Array(AgentId)),
  maxDepth: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
});
export type DelegationPolicy = typeof DelegationPolicy.Type;

// ── Agent Definition ────────────────────────────────────────────

export const AgentDefinition = Schema.Struct({
  id: AgentId,
  name: TrimmedNonEmptyString,
  description: TrimmedNonEmptyString,
  mode: AgentMode,
  systemPrompt: TrimmedNonEmptyString,
  modelFallbackChain: Schema.Array(ModelFallbackEntry),
  toolPolicy: Schema.optional(AgentToolPolicy),
  delegationPolicy: DelegationPolicy,
  tags: Schema.optional(Schema.Array(TrimmedNonEmptyString)),
});
export type AgentDefinition = typeof AgentDefinition.Type;

// ── Agent Catalog ───────────────────────────────────────────────

export const AgentCatalog = Schema.Struct({
  agents: Schema.Array(AgentDefinition),
});
export type AgentCatalog = typeof AgentCatalog.Type;
