import { memo } from "react";
import {
  BotIcon,
  CpuIcon,
  InfoIcon,
  ShieldIcon,
  UsersIcon,
  WrenchIcon,
} from "lucide-react";
import {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { ScrollArea } from "./ui/scroll-area";
import { useAgentCatalog } from "~/hooks/useAgentCatalog";

function modeLabel(mode: string) {
  return mode === "primary" ? "Primary" : "Sub-agent";
}

function modeVariant(mode: string): "default" | "secondary" {
  return mode === "primary" ? "default" : "secondary";
}

function formatAgentId(id: string) {
  return id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export const AgentCatalogDialog = memo(function AgentCatalogDialog() {
  const { data: catalog } = useAgentCatalog();
  const agents = catalog?.agents ?? [];
  const primaryAgents = agents.filter((a) => a.mode === "primary");
  const subAgents = agents.filter((a) => a.mode === "subagent");

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            size="sm"
            variant="ghost"
            className="size-7 shrink-0 p-0 text-muted-foreground/50 hover:text-foreground/70"
            title="View all agents"
          />
        }
      >
        <InfoIcon className="size-3.5" />
      </DialogTrigger>
      <DialogPortal>
        <DialogBackdrop />
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Agent Catalog</DialogTitle>
            <DialogDescription>
              {agents.length} agents available — {primaryAgents.length} primary, {subAgents.length} sub-agents
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[60vh] pr-3">
            {primaryAgents.length > 0 && (
              <div className="mb-4">
                <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <UsersIcon className="size-3.5" />
                  Primary Agents
                </h3>
                <p className="mb-3 text-xs text-muted-foreground/70">
                  Select these in the composer to control your thread. They manage the workflow and can delegate to sub-agents.
                </p>
                <div className="flex flex-col gap-2">
                  {primaryAgents.map((agent) => (
                    <AgentCard key={agent.id} agent={agent} />
                  ))}
                </div>
              </div>
            )}

            {subAgents.length > 0 && (
              <div>
                <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <WrenchIcon className="size-3.5" />
                  Sub-Agents
                </h3>
                <p className="mb-3 text-xs text-muted-foreground/70">
                  Spawned by primary agents during delegation. Not directly selectable — they run as child threads.
                </p>
                <div className="flex flex-col gap-2">
                  {subAgents.map((agent) => (
                    <AgentCard key={agent.id} agent={agent} />
                  ))}
                </div>
              </div>
            )}
          </ScrollArea>

          <DialogFooter>
            <DialogClose render={<Button variant="ghost" size="sm" />}>
              Close
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
});

interface AgentCardProps {
  agent: {
    id: string;
    name: string;
    description: string;
    mode: string;
    modelFallbackChain: ReadonlyArray<{ provider: string; model: string }>;
    delegationPolicy: { canDelegate: boolean; allowedSubAgents?: readonly string[] | undefined };
    toolPolicy?: { restriction: string; tools: readonly string[] } | undefined;
  };
}

const AgentCard = memo(function AgentCard({ agent }: AgentCardProps) {
  return (
    <div className="rounded-md border border-border/50 bg-card p-3">
      <div className="mb-1.5 flex items-center gap-2">
        <BotIcon className="size-4 shrink-0 text-foreground/70" />
        <span className="font-medium text-sm">{agent.name}</span>
        <Badge variant={modeVariant(agent.mode)} size="sm">
          {modeLabel(agent.mode)}
        </Badge>
      </div>

      <p className="mb-2 text-xs text-muted-foreground leading-relaxed">
        {agent.description}
      </p>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground/70">
        {/* Models */}
        <span className="flex items-center gap-1">
          <CpuIcon className="size-3" />
          {agent.modelFallbackChain.map((m) => m.model).join(" → ")}
        </span>

        {/* Delegation */}
        {agent.delegationPolicy.canDelegate && agent.delegationPolicy.allowedSubAgents && (
          <span className="flex items-center gap-1">
            <UsersIcon className="size-3" />
            Delegates to: {agent.delegationPolicy.allowedSubAgents.map(formatAgentId).join(", ")}
          </span>
        )}

        {/* Tool restrictions */}
        {agent.toolPolicy && (
          <span className="flex items-center gap-1">
            <ShieldIcon className="size-3" />
            {agent.toolPolicy.restriction === "block"
              ? `Blocks: ${agent.toolPolicy.tools.join(", ")}`
              : `Only: ${agent.toolPolicy.tools.join(", ")}`}
          </span>
        )}
      </div>
    </div>
  );
});
