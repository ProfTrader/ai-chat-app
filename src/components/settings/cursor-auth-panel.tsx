import { useState } from "react";
import { ExternalLink, KeyRound, LogOut } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { useAuthStore } from "@/stores/auth-store";
import { toast } from "sonner";

export function CursorAuthPanel() {
  const {
    status,
    models,
    connecting,
    error,
    beginCursorSignIn,
    connectWithApiKey,
    disconnect,
    setModel,
    loadModels,
  } = useAuthStore();
  const [showApiKeyForm, setShowApiKeyForm] = useState(false);
  const [apiKey, setApiKey] = useState("");

  const handleSignIn = async () => {
    try {
      await beginCursorSignIn();
      toast.message("Complete sign-in in your browser, then paste your API key if needed.");
      setShowApiKeyForm(true);
    } catch {
      setShowApiKeyForm(true);
    }
  };

  const handleConnectApiKey = async () => {
    if (!apiKey.trim()) return;
    try {
      await connectWithApiKey(apiKey.trim());
      setApiKey("");
      setShowApiKeyForm(false);
      toast.success("Connected to Cursor");
    } catch {
      toast.error("Could not validate Cursor API key");
    }
  };

  const handleDisconnect = async () => {
    await disconnect();
    toast.success("Disconnected from Cursor");
  };

  if (status?.connected) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-muted/30 p-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium">Cursor account</p>
              <Badge variant="secondary">Connected</Badge>
              {status.devOverride && <Badge variant="outline">Dev override</Badge>}
            </div>
            <p className="mt-1 truncate text-sm text-muted-foreground">
              {status.email ?? "Authenticated"}
            </p>
          </div>
          {!status.devOverride && (
            <Button variant="outline" size="sm" onClick={() => void handleDisconnect()}>
              <LogOut data-icon="inline-start" />
              Disconnect
            </Button>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="cursor-model">Model</Label>
          <Select
            value={status.model}
            onValueChange={(value) => {
              if (value) void setModel(value);
            }}
            onOpenChange={(open) => {
              if (open && models.length === 0) void loadModels();
            }}
          >
            <SelectTrigger id="cursor-model" className="w-full">
              <SelectValue placeholder="Select model" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {(models.length > 0 ? models : [{ id: status.model, name: status.model }]).map(
                  (model) => (
                    <SelectItem key={model.id} value={model.id}>
                      {model.name}
                    </SelectItem>
                  ),
                )}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-dashed border-border bg-muted/20 p-4">
        <p className="text-sm text-muted-foreground">
          Connect Cursor to stream assistant replies in chat. Browser sign-in opens Cursor, then
          you can paste an API key from your dashboard.
        </p>
      </div>

      {connecting && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner />
          Complete sign-in in your browser…
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-col gap-2">
        <Button onClick={() => void handleSignIn()} disabled={connecting}>
          {connecting ? <Spinner data-icon="inline-start" /> : null}
          Sign in with Cursor
        </Button>
        <Button variant="outline" onClick={() => setShowApiKeyForm((value) => !value)}>
          <KeyRound data-icon="inline-start" />
          Use API key instead
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => window.open("https://cursor.com/dashboard", "_blank", "noopener,noreferrer")}
        >
          <ExternalLink data-icon="inline-start" />
          Open Cursor dashboard
        </Button>
      </div>

      {showApiKeyForm && (
        <>
          <Separator />
          <div className="flex flex-col gap-2">
            <Label htmlFor="cursor-api-key">Cursor API key</Label>
            <Input
              id="cursor-api-key"
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="cursor_..."
            />
            <Button onClick={() => void handleConnectApiKey()} disabled={!apiKey.trim()}>
              Connect
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
