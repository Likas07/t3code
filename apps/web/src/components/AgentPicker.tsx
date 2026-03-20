import { memo, useState } from "react";
import { BotIcon, ChevronDownIcon } from "lucide-react";
import { Button } from "./ui/button";
import {
  Menu,
  MenuGroup,
  MenuItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from "./ui/menu";
import { cn } from "~/lib/utils";
import { useAgentCatalog } from "~/hooks/useAgentCatalog";
import { AgentCatalogDialog } from "./AgentCatalogDialog";

export const AgentPicker = memo(function AgentPicker(props: {
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string | null) => void;
  compact?: boolean;
  disabled?: boolean;
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { data: catalog } = useAgentCatalog();

  const primaryAgents = catalog?.agents.filter((agent) => agent.mode === "primary") ?? [];
  const selectedAgent = primaryAgents.find((agent) => agent.id === props.selectedAgentId) ?? null;

  const isPrometheus = props.selectedAgentId === "prometheus";
  const label = selectedAgent ? selectedAgent.name : "No agent";

  return (
    <span className="inline-flex items-center gap-0.5">
    <Menu
      open={isMenuOpen}
      onOpenChange={(open) => {
        if (props.disabled) {
          setIsMenuOpen(false);
          return;
        }
        setIsMenuOpen(open);
      }}
    >
      <MenuTrigger
        render={
          <Button
            size="sm"
            variant="ghost"
            className={cn(
              "min-w-0 justify-start overflow-hidden whitespace-nowrap px-2 text-muted-foreground/70 hover:text-foreground/80 [&_svg]:mx-0",
              props.compact ? "max-w-36 shrink-0" : "max-w-44 shrink sm:max-w-48 sm:px-3",
            )}
            disabled={props.disabled}
          />
        }
      >
        <span
          className={cn(
            "flex min-w-0 w-full items-center gap-2 overflow-hidden",
            props.compact ? "max-w-32" : undefined,
          )}
        >
          <BotIcon
            aria-hidden="true"
            className={cn(
              "size-4 shrink-0",
              selectedAgent ? "text-foreground/70" : "text-muted-foreground/70",
            )}
          />
          <span className="min-w-0 flex-1 truncate">
            {label}
            {isPrometheus && (
              <span className="ml-1 text-[10px] text-muted-foreground/50">Plan</span>
            )}
          </span>
          <ChevronDownIcon aria-hidden="true" className="size-3 shrink-0 opacity-60" />
        </span>
      </MenuTrigger>
      <MenuPopup align="start" className="w-64">
        <MenuGroup>
          <MenuRadioGroup
            value={props.selectedAgentId ?? ""}
            onValueChange={(value) => {
              props.onSelectAgent(value || null);
              setIsMenuOpen(false);
            }}
          >
            <MenuRadioItem value="">
              <div className="flex flex-col gap-0.5">
                <span className="font-medium">No agent</span>
                <span className="text-muted-foreground text-xs">Use the default provider</span>
              </div>
            </MenuRadioItem>
            {primaryAgents.map((agent) => (
              <MenuRadioItem key={agent.id} value={agent.id}>
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium">{agent.name}</span>
                    {agent.modelFallbackChain.length > 0 && (
                      <span className="text-[10px] text-muted-foreground/50">
                        {agent.modelFallbackChain[0]!.model}
                      </span>
                    )}
                  </div>
                  <span className="text-muted-foreground text-xs line-clamp-1">
                    {agent.description}
                  </span>
                </div>
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuGroup>
      </MenuPopup>
    </Menu>
    <AgentCatalogDialog />
    </span>
  );
});
