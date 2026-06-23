import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ContextChip } from "@/types";

interface ContextChipProps {
  chip: ContextChip;
  onRemove?: (id: string) => void;
}

export function ContextChipBadge({ chip, onRemove }: ContextChipProps) {
  return (
    <Badge variant="secondary" className="gap-1.5 py-1 pr-1 pl-2.5 text-sm font-normal">
      <span className="text-xs text-muted-foreground uppercase">{chip.type}</span>
      {chip.label}
      {onRemove && (
        <Button
          variant="ghost"
          size="icon-xs"
          className="ml-0.5 size-5 hover:bg-transparent"
          onClick={() => onRemove(chip.id)}
        >
          <X />
        </Button>
      )}
    </Badge>
  );
}
