import { useQuery } from "@tanstack/react-query";
import { agentCatalogQueryOptions } from "~/lib/agentReactQuery";

export function useAgentCatalog() {
  return useQuery(agentCatalogQueryOptions());
}
