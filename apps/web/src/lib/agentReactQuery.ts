import { queryOptions } from "@tanstack/react-query";
import { ensureNativeApi } from "~/nativeApi";

export const agentQueryKeys = {
  all: ["agent"] as const,
  catalog: () => ["agent", "catalog"] as const,
};

export function agentCatalogQueryOptions() {
  return queryOptions({
    queryKey: agentQueryKeys.catalog(),
    queryFn: async () => {
      const api = ensureNativeApi();
      return api.agent.getCatalog();
    },
    staleTime: Infinity,
  });
}
