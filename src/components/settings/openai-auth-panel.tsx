import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";

export function OpenAiAuthPanel() {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border bg-muted/20 p-4">
      <div className="flex items-center gap-2">
        <Label>OpenAI provider</Label>
        <Badge variant="outline">Coming soon</Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        OpenAI Platform API access uses secure local API keys rather than OAuth. A provider
        switcher will land here in a future update.
      </p>
    </div>
  );
}
