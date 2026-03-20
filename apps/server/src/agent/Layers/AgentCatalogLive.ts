import type { AgentDefinition } from "@t3tools/contracts";
import { Effect, FileSystem, Layer, Path } from "effect";

import { ServerConfig } from "../../config.ts";
import { AgentCatalogService, type AgentCatalogServiceShape } from "../Services/AgentCatalog.ts";
import { loadAgentDefinitionsFromYaml, mergeAgentLayers } from "../agentCatalogLoader.ts";
import { resolveModelForAgent } from "../agentModelResolution.ts";

/**
 * Load all YAML files from a directory, returning agent definitions.
 * Returns empty array if the directory doesn't exist.
 */
const loadAgentsFromDirectory = (
  directoryPath: string,
  fs: FileSystem.FileSystem,
  pathService: Path.Path,
) =>
  Effect.gen(function* () {
    const exists = yield* fs.exists(directoryPath);
    if (!exists) return [];

    const entries = yield* fs.readDirectory(directoryPath);
    const yamlFiles = entries.filter(
      (entry: string) => entry.endsWith(".yaml") || entry.endsWith(".yml"),
    );

    const agents: AgentDefinition[] = [];
    for (const file of yamlFiles) {
      const filePath = pathService.join(directoryPath, file);
      try {
        const content = yield* fs.readFileString(filePath);
        const parsed = loadAgentDefinitionsFromYaml(content);
        agents.push(...parsed);
      } catch {
        yield* Effect.logWarning(`Failed to load agent definition from ${filePath}`);
      }
    }
    return agents;
  });

const makeAgentCatalogService = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const pathService = yield* Path.Path;
  const serverConfig = yield* ServerConfig;

  // Bundled agents are shipped alongside the server build.
  // In dev:     {repoRoot}/apps/server/src/agent/Layers/ → ../../../../../agents
  // In build:   {repoRoot}/apps/server/dist/               → ../../../agents
  // In desktop: {stageAppDir}/apps/server/dist/            → ../../../agents
  // All cases: walk up from import.meta.dirname until we find an "agents" dir.
  const serverDir = import.meta.dirname;
  const candidatePaths = [
    pathService.resolve(serverDir, "..", "..", "..", "..", "..", "agents"), // dev (src/agent/Layers/)
    pathService.resolve(serverDir, "..", "..", "..", "agents"),            // built (dist/)
    pathService.resolve(serverDir, "..", "agents"),                        // flat layout
  ];
  let bundledAgentsDir: string | null = null;
  for (const candidate of candidatePaths) {
    if (yield* fs.exists(candidate)) {
      bundledAgentsDir = candidate;
      break;
    }
  }
  if (!bundledAgentsDir) {
    yield* Effect.logWarning(
      `No bundled agents directory found. Searched: ${candidatePaths.join(", ")}`,
    );
  }
  const projectAgentsDir = pathService.resolve(serverConfig.cwd, ".t3code", "agents");

  const bundledAgents = bundledAgentsDir
    ? yield* loadAgentsFromDirectory(bundledAgentsDir, fs, pathService)
    : [];
  const projectAgents = yield* loadAgentsFromDirectory(projectAgentsDir, fs, pathService);

  const additionalLayers: AgentDefinition[][] = [];
  for (const agentPath of serverConfig.agentPaths ?? []) {
    const resolved = pathService.resolve(agentPath);
    const agents = yield* loadAgentsFromDirectory(resolved, fs, pathService);
    additionalLayers.push(agents);
  }

  // Merge: bundled → project → configurable paths (later overrides earlier by id)
  const allAgents = mergeAgentLayers([bundledAgents, projectAgents, ...additionalLayers]);

  yield* Effect.log(`Loaded ${allAgents.length} agent definitions`);

  const agentById = new Map(allAgents.map((agent) => [agent.id, agent] as const));

  return {
    getAgent: (agentId) =>
      Effect.succeed(agentById.get(agentId) ?? null),

    listAgents: (filter) =>
      Effect.succeed(
        filter?.mode
          ? allAgents.filter((agent) => agent.mode === filter.mode)
          : [...allAgents],
      ),

    getCatalog: () =>
      Effect.succeed({ agents: allAgents }),

    resolveModelForAgent: (agentId, availableProviders) =>
      Effect.gen(function* () {
        const agent = agentById.get(agentId);
        if (!agent) return null;
        return resolveModelForAgent(agent, availableProviders);
      }),
  } satisfies AgentCatalogServiceShape;
});

export const AgentCatalogServiceLive = Layer.effect(
  AgentCatalogService,
  makeAgentCatalogService,
);
