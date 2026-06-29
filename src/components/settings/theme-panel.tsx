import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Check, Hash, Monitor, Moon, Sun } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface ThemeOption {
  value: string;
  label: string;
  description: string;
  icon: LucideIcon;
  /** Mini preview swatch: [rail, content, accent] */
  swatch: [string, string, string];
}

const THEME_OPTIONS: ThemeOption[] = [
  {
    value: "dark",
    label: "Studio (Dark)",
    description: "The current near-black workspace.",
    icon: Moon,
    swatch: ["oklch(0.115 0 0)", "oklch(0.175 0 0)", "oklch(0.985 0 0)"],
  },
  {
    value: "studio-light",
    label: "Studio (Light)",
    description: "Grey/black left rail with a white chat area and panel.",
    icon: Sun,
    swatch: ["oklch(0.205 0 0)", "oklch(1 0 0)", "oklch(0.205 0 0)"],
  },
  {
    value: "slack",
    label: "Aubergine",
    description: "Deep purple rail with a bright message column.",
    icon: Hash,
    swatch: ["oklch(0.252 0.074 328)", "oklch(1 0 0)", "oklch(0.515 0.132 248)"],
  },
  {
    value: "lavender",
    label: "Lavender",
    description: "Soft light theme with a pale lilac rail and dark text.",
    icon: Hash,
    swatch: ["oklch(0.926 0.026 322)", "oklch(1 0 0)", "oklch(0.515 0.122 250)"],
  },
  {
    value: "system",
    label: "System",
    description: "Match your operating system appearance.",
    icon: Monitor,
    swatch: ["oklch(0.278 0.076 328)", "oklch(0.150 0 0)", "oklch(0.700 0.160 251)"],
  },
];

export function ThemePanel() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // next-themes resolves the active theme only after mount; guard the
  // selected-state highlight so it doesn't flash the default on first paint.
  useEffect(() => setMounted(true), []);

  return (
    <div className="grid gap-2">
      {THEME_OPTIONS.map((option) => {
        const Icon = option.icon;
        const isActive = mounted && theme === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => setTheme(option.value)}
            aria-pressed={isActive}
            className={cn(
              "flex items-center gap-3 rounded-lg border p-3 text-left transition-colors",
              isActive
                ? "border-brand bg-accent"
                : "border-border hover:bg-muted",
            )}
          >
            <span
              className="flex h-9 w-12 shrink-0 overflow-hidden rounded-md border border-border"
              aria-hidden
            >
              <span className="w-1/3" style={{ background: option.swatch[0] }} />
              <span
                className="flex flex-1 items-end justify-end p-1"
                style={{ background: option.swatch[1] }}
              >
                <span
                  className="size-2 rounded-full"
                  style={{ background: option.swatch[2] }}
                />
              </span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <Icon className="size-3.5 text-muted-foreground" />
                {option.label}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {option.description}
              </span>
            </span>
            {isActive ? <Check className="size-4 shrink-0 text-brand" /> : null}
          </button>
        );
      })}
    </div>
  );
}
