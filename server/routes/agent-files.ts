import { Hono } from "hono";
import {
  appendAgentNote,
  isAgentFileName,
  listAgentFiles,
  readAgentFile,
  writeAgentFile,
  type AgentFileUpdatedBy,
} from "../lib/agent-files.js";

export const agentFiles = new Hono();

function normalizeUpdatedBy(value: unknown): AgentFileUpdatedBy {
  return value === "user" || value === "agent" || value === "system" ? value : "user";
}

agentFiles.get("/", async (c) => {
  return c.json({ files: await listAgentFiles() });
});

agentFiles.get("/:name", async (c) => {
  const name = c.req.param("name");
  if (!isAgentFileName(name)) {
    return c.json({ code: "UNKNOWN_FILE", message: `Unknown agent file: ${name}` }, 404);
  }
  const file = await readAgentFile(name);
  return file
    ? c.json(file)
    : c.json({ code: "NOT_FOUND", message: "File not found." }, 404);
});

agentFiles.put("/:name", async (c) => {
  const name = c.req.param("name");
  if (!isAgentFileName(name)) {
    return c.json({ code: "UNKNOWN_FILE", message: `Unknown agent file: ${name}` }, 404);
  }
  const body = await c.req.json().catch(() => ({}));
  if (typeof body.content !== "string") {
    return c.json({ code: "INVALID_REQUEST", message: "Missing string `content`." }, 400);
  }
  const file = await writeAgentFile(name, body.content, normalizeUpdatedBy(body.updatedBy));
  return c.json(file);
});

agentFiles.post("/:name/append", async (c) => {
  const name = c.req.param("name");
  if (!isAgentFileName(name)) {
    return c.json({ code: "UNKNOWN_FILE", message: `Unknown agent file: ${name}` }, 404);
  }
  const body = await c.req.json().catch(() => ({}));
  if (typeof body.heading !== "string" || typeof body.body !== "string") {
    return c.json(
      { code: "INVALID_REQUEST", message: "Missing string `heading` and `body`." },
      400,
    );
  }
  const file = await appendAgentNote(
    name,
    body.heading,
    body.body,
    normalizeUpdatedBy(body.updatedBy),
    { maxEntries: typeof body.maxEntries === "number" ? body.maxEntries : undefined },
  );
  return c.json(file);
});
