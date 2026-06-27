import { readFile } from "node:fs/promises";
import path from "node:path";

let cachedDesign: string | null = null;

export async function loadNexusDesignBrief() {
  if (cachedDesign) return cachedDesign;

  try {
    cachedDesign = await readFile(
      path.join(process.cwd(), "src/lib/artifacts/design.md"),
      "utf8",
    );
  } catch {
    cachedDesign = [
      "# Nexus HTML Brief Design",
      "- Product brand: Nexus.",
      "- Apply a dark professional report style with active data accents.",
      "- Keep claims grounded in supplied Nexus evidence only.",
    ].join("\n");
  }

  return cachedDesign;
}
