import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      enableColorScheme
      themes={["light", "dark", "studio-light", "slack", "lavender"]}
      storageKey="crm-theme"
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
