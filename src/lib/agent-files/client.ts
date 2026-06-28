export type AgentFileName =
  | "soul-of-firm.md"
  | "soul-of-agent.md"
  | "agents.md"
  | "memory.md"
  | "session.md";

export type AgentFileUpdatedBy = "user" | "agent" | "system";

export interface AgentFile {
  name: AgentFileName;
  title: string;
  description: string;
  content: string;
  updatedBy: AgentFileUpdatedBy;
  updatedAt: string;
}

export async function fetchAgentFiles(): Promise<AgentFile[]> {
  const response = await fetch("/api/agent-files", { credentials: "include" });
  if (!response.ok) throw new Error("Failed to load agent files");
  const data = (await response.json()) as { files: AgentFile[] };
  return data.files;
}

export async function saveAgentFile(
  name: AgentFileName,
  content: string,
  updatedBy: AgentFileUpdatedBy = "user",
): Promise<AgentFile> {
  const response = await fetch(`/api/agent-files/${name}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, updatedBy }),
  });
  if (!response.ok) throw new Error("Failed to save agent file");
  return (await response.json()) as AgentFile;
}

/**
 * Append a timestamped note to an evolving file (memory.md / session.md). Used by
 * the agent to self-update its long-term memory and session log. Fire-and-forget
 * friendly — callers can ignore failures.
 */
export async function appendAgentNote(
  name: AgentFileName,
  heading: string,
  body: string,
  updatedBy: AgentFileUpdatedBy = "agent",
): Promise<AgentFile | null> {
  try {
    const response = await fetch(`/api/agent-files/${name}/append`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ heading, body, updatedBy }),
    });
    if (!response.ok) return null;
    return (await response.json()) as AgentFile;
  } catch {
    return null;
  }
}
