import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import {
  ArrowLeft,
  FileCog,
  MessageSquare,
  Palette,
  Search,
  Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CursorAuthPanel } from "@/components/settings/cursor-auth-panel";
import { OpenAiAuthPanel } from "@/components/settings/openai-auth-panel";
import { AgentFilesPanel } from "@/components/settings/agent-files-panel";
import { ThemePanel } from "@/components/settings/theme-panel";
import { useAuthStore } from "@/stores/auth-store";
import { useShellStore } from "@/stores/shell-store";
import { cn } from "@/lib/utils";

interface SettingsSection {
  id: string;
  label: string;
  group: string;
  icon: LucideIcon;
  title: string;
  description: string;
  render: () => ReactNode;
}

const SECTIONS: SettingsSection[] = [
  {
    id: "appearance",
    label: "Appearance",
    group: "Personal",
    icon: Palette,
    title: "Appearance",
    description:
      "Choose how the workspace looks. Studio is the original dark theme; Aubergine is a bright, Slack-style layout.",
    render: () => <ThemePanel />,
  },
  {
    id: "chat-provider",
    label: "Chat provider",
    group: "Integrations",
    icon: MessageSquare,
    title: "Chat provider",
    description: "Connect Moonshot/Kimi (or a local Ollama model) and pick the chat model.",
    render: () => <CursorAuthPanel />,
  },
  {
    id: "openai",
    label: "OpenAI",
    group: "Integrations",
    icon: Sparkles,
    title: "OpenAI",
    description: "Add an OpenAI key for providers that use it.",
    render: () => <OpenAiAuthPanel />,
  },
  {
    id: "agent-brain",
    label: "Agent brain",
    group: "Workspace",
    icon: FileCog,
    title: "Agent brain files",
    description: "Manage the files that shape how the agent thinks and acts.",
    render: () => <AgentFilesPanel />,
  },
];

const GROUP_ORDER = ["Personal", "Integrations", "Workspace"];

export function SettingsDialog() {
  const settingsOpen = useShellStore((s) => s.settingsOpen);
  const setSettingsOpen = useShellStore((s) => s.setSettingsOpen);
  const refreshStatus = useAuthStore((s) => s.refreshStatus);
  const loadModels = useAuthStore((s) => s.loadModels);

  const [activeId, setActiveId] = useState<string>("appearance");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!settingsOpen) return;
    void refreshStatus().then(() => {
      const connected = useAuthStore.getState().status?.connected;
      if (connected) void loadModels();
    });
  }, [settingsOpen, refreshStatus, loadModels]);

  // Reset transient UI each time the panel opens.
  useEffect(() => {
    if (settingsOpen) {
      setActiveId("appearance");
      setQuery("");
    }
  }, [settingsOpen]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SECTIONS;
    return SECTIONS.filter(
      (section) =>
        section.label.toLowerCase().includes(q) ||
        section.group.toLowerCase().includes(q) ||
        section.description.toLowerCase().includes(q),
    );
  }, [query]);

  const grouped = useMemo(() => {
    const map = new Map<string, SettingsSection[]>();
    for (const section of filtered) {
      map.set(section.group, [...(map.get(section.group) ?? []), section]);
    }
    return GROUP_ORDER.filter((group) => map.has(group)).map(
      (group) => [group, map.get(group)!] as const,
    );
  }, [filtered]);

  const active = SECTIONS.find((section) => section.id === activeId) ?? SECTIONS[0];

  return (
    <DialogPrimitive.Root open={settingsOpen} onOpenChange={setSettingsOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Popup
          className={cn(
            "fixed inset-0 z-50 flex overflow-hidden outline-none",
            // Translucent settings surface — the app shows faintly through (~25%).
            "bg-background/75 text-foreground backdrop-blur-2xl",
            "data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
          )}
        >
          {/* Left category rail */}
          <aside className="flex w-64 shrink-0 flex-col border-r border-border/60 bg-foreground/[0.02]">
            <div className="px-3 pt-4">
              <DialogPrimitive.Close
                render={
                  <Button
                    variant="ghost"
                    className="h-9 w-full justify-start gap-2 px-2 text-sm font-normal text-muted-foreground"
                  />
                }
              >
                <ArrowLeft className="size-4" />
                Back to app
              </DialogPrimitive.Close>
            </div>
            <div className="px-3 py-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search settings..."
                  className="h-9 pl-8"
                />
              </div>
            </div>
            <ScrollArea className="min-h-0 flex-1 px-3 pb-4">
              <nav className="flex flex-col gap-4">
                {grouped.length === 0 ? (
                  <p className="px-2 py-4 text-xs text-muted-foreground">
                    No settings match “{query}”.
                  </p>
                ) : (
                  grouped.map(([group, sections]) => (
                    <div key={group} className="flex flex-col gap-0.5">
                      <p className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">
                        {group}
                      </p>
                      {sections.map((section) => {
                        const Icon = section.icon;
                        const isActive = section.id === activeId;
                        return (
                          <button
                            key={section.id}
                            type="button"
                            onClick={() => setActiveId(section.id)}
                            aria-current={isActive}
                            className={cn(
                              "flex h-8 items-center gap-2 rounded-md px-2 text-left text-sm transition-colors",
                              isActive
                                ? "bg-muted text-foreground"
                                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                            )}
                          >
                            <Icon className="size-4 shrink-0" />
                            <span className="truncate">{section.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  ))
                )}
              </nav>
            </ScrollArea>
          </aside>

          {/* Right content column */}
          <ScrollArea className="min-h-0 flex-1">
            <div className="mx-auto w-full max-w-2xl px-8 py-10">
              <DialogPrimitive.Title className="font-heading text-xl font-medium tracking-tight">
                {active.title}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1 text-sm text-muted-foreground">
                {active.description}
              </DialogPrimitive.Description>
              <div className="mt-8">{active.render()}</div>
            </div>
          </ScrollArea>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
