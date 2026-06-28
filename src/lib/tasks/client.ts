export interface ProposedTask {
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  status: "todo" | "in_progress" | "done";
  assignee?: string;
  dueDate?: string;
}

interface ProposeResponse {
  provider: string;
  model: string;
  tasks: ProposedTask[];
}

export interface ProposeTasksPayload {
  instruction: string;
  projectName?: string;
  team?: string[];
  existingTasks?: string[];
}

export async function proposeTasks(payload: ProposeTasksPayload): Promise<ProposedTask[]> {
  const response = await fetch("/api/tasks/propose", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) {
    throw Object.assign(new Error(data.message ?? "Failed to propose tasks"), { code: data.code });
  }
  return (data as ProposeResponse).tasks;
}

const enc = (s: string) => btoa(unescape(encodeURIComponent(s)));
const dec = (s: string) => decodeURIComponent(escape(atob(s)));

export function encodeTasksMarker(tasksList: ProposedTask[]): string {
  return `[[nexus:tasks:${enc(JSON.stringify(tasksList))}]]`;
}

export function parseTasksMarker(text: string): { tasks: ProposedTask[] | null; cleanText: string } {
  const match = text.match(/\[\[nexus:tasks:([^\]]+)\]\]/);
  if (!match) return { tasks: null, cleanText: text };
  let parsed: ProposedTask[] | null = null;
  try {
    parsed = JSON.parse(dec(match[1])) as ProposedTask[];
  } catch {
    parsed = null;
  }
  return { tasks: parsed, cleanText: text.replace(match[0], "").trim() };
}
