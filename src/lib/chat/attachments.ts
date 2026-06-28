import type { ComposerAttachment } from "@/stores/chat-store";

export interface AttachmentMeta {
  name: string;
  mime: string;
  size: number;
  kind: "image" | "text" | "file";
}

const TEXT_EXT =
  /\.(txt|md|markdown|csv|tsv|json|jsonl|js|mjs|cjs|ts|tsx|jsx|py|rb|go|rs|java|c|cpp|h|html|css|scss|yml|yaml|xml|toml|ini|env|log|sql|sh)$/i;

const MAX_TEXT_CHARS = 8000;

function encodeBase64(value: string): string {
  return btoa(unescape(encodeURIComponent(value)));
}

function decodeBase64(value: string): string {
  return decodeURIComponent(escape(atob(value)));
}

export async function fileToAttachment(file: File): Promise<ComposerAttachment> {
  const isImage = file.type.startsWith("image/");
  const isText =
    file.type.startsWith("text/") ||
    file.type === "application/json" ||
    TEXT_EXT.test(file.name);

  const attachment: ComposerAttachment = {
    id: crypto.randomUUID().slice(0, 8),
    name: file.name,
    mime: file.type || "application/octet-stream",
    size: file.size,
    kind: isImage ? "image" : isText ? "text" : "file",
  };

  if (isImage) {
    attachment.previewUrl = URL.createObjectURL(file);
  } else if (isText) {
    try {
      attachment.text = (await file.text()).slice(0, MAX_TEXT_CHARS);
    } catch {
      // ignore unreadable files; keep as metadata only
    }
  }

  return attachment;
}

/**
 * Build the outgoing message: visible text + a metadata marker (for rendering
 * chips) + a hidden file block (so the agent receives file contents). The
 * markers are stripped from display by parseMessageAttachments.
 */
export function composeMessageWithAttachments(
  text: string,
  attachments: ComposerAttachment[],
): string {
  const base = text.trim();
  if (attachments.length === 0) return base;

  const meta: AttachmentMeta[] = attachments.map((a) => ({
    name: a.name,
    mime: a.mime,
    size: a.size,
    kind: a.kind,
  }));
  const metaTag = `[[nexus:files:${encodeBase64(JSON.stringify(meta))}]]`;

  const contentBlocks = attachments
    .map((a) => {
      if (a.kind === "text" && a.text) {
        return `File: ${a.name} (${a.mime})\n"""\n${a.text}\n"""`;
      }
      if (a.kind === "image") {
        return `Image attached: ${a.name} (${a.mime}, ${formatBytes(a.size)}). The raw image is not included as text.`;
      }
      return `File attached: ${a.name} (${a.mime}, ${formatBytes(a.size)}). Binary contents not included.`;
    })
    .join("\n\n");

  const fileBlock = `[[nexus:fileblock]]\nThe user attached these files for context:\n\n${contentBlocks}\n[[/nexus:fileblock]]`;
  return `${base ? `${base}\n\n` : ""}${metaTag}\n${fileBlock}`;
}

export function parseMessageAttachments(raw: string): {
  attachments: AttachmentMeta[];
  cleanText: string;
} {
  let cleanText = raw;
  let attachments: AttachmentMeta[] = [];

  const metaMatch = raw.match(/\[\[nexus:files:([^\]]+)\]\]/);
  if (metaMatch) {
    try {
      attachments = JSON.parse(decodeBase64(metaMatch[1])) as AttachmentMeta[];
    } catch {
      attachments = [];
    }
    cleanText = cleanText.replace(metaMatch[0], "");
  }
  cleanText = cleanText.replace(/\[\[nexus:fileblock\]\][\s\S]*?\[\[\/nexus:fileblock\]\]/g, "");

  return { attachments, cleanText: cleanText.trim() };
}

/** Remove all nexus markers (files, fileblock, email, view-brief) for display/titles. */
export function stripNexusMarkers(text: string): string {
  return text
    .replace(/\[\[nexus:fileblock\]\][\s\S]*?\[\[\/nexus:fileblock\]\]/g, "")
    .replace(/\[\[nexus:files:[^\]]+\]\]/g, "")
    .replace(/\[\[nexus:email:[^\]]+\]\]/g, "")
    .replace(/\[\[nexus:tasks:[^\]]+\]\]/g, "")
    .replace(/\[\[nexus:ask:[^\]]+\]\]/g, "")
    .replace(/\[\[nexus:doc:[^\]]+\]\]/g, "")
    .replace(/\[\[nexus:deliver:[^\]]+\]\]/g, "")
    .replace(/\n?\[\[nexus:view-brief:[^\]]+\]\]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
