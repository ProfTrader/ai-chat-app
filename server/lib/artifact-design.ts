import { readFile } from "node:fs/promises";
import path from "node:path";

let cachedDesign: string | null = null;

export async function loadTradeifyDesignBrief() {
  if (cachedDesign) return cachedDesign;

  try {
    cachedDesign = await readFile(
      path.join(process.cwd(), "src/lib/artifacts/design.md"),
      "utf8",
    );
  } catch {
    cachedDesign = [
      "# Tradeify HTML Brief Design",
      "- Client brand: Tradeify.",
      "- Use the official Tradeify brand direction from https://tradeify.co/.",
      "- Apply a dark prop-firm executive report style with green and gold accents.",
      "- Keep claims grounded in supplied Nexus evidence only.",
    ].join("\n");
  }

  return cachedDesign;
}
