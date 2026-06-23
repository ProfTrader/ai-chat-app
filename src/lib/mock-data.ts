import type {
  Contact,
  Message,
  Project,
  Session,
  Task,
  TeamMember,
  Workspace,
} from "@/types";

export const mockWorkspaces: Workspace[] = [
  { id: "ws-1", name: "Acme Corp" },
  { id: "ws-2", name: "Personal" },
];

export const mockProjects: Project[] = [
  { id: "proj-1", workspaceId: "ws-1", name: "Q2 Launch", slug: "q2-launch" },
  { id: "proj-2", workspaceId: "ws-1", name: "Enterprise Sales", slug: "enterprise" },
  { id: "proj-3", workspaceId: "ws-2", name: "Side Project", slug: "side" },
];

export const mockTasks: Task[] = [
  {
    id: "task-1",
    projectId: "proj-1",
    identifier: "Q2-1",
    title: "Finalize onboarding flow wireframes",
    status: "todo",
    description: "Review current funnel and update wireframes for the new signup path.",
    assignee: "Alex",
    priority: "high",
    dueDate: "Jun 25",
    createdAt: "2026-06-20T10:00:00Z",
    updatedAt: "2026-06-22T14:00:00Z",
  },
  {
    id: "task-2",
    projectId: "proj-1",
    identifier: "Q2-2",
    title: "Draft launch email sequence",
    status: "todo",
    description: "Three-part drip campaign for waitlist users.",
    priority: "medium",
    dueDate: "Jun 28",
    createdAt: "2026-06-21T09:00:00Z",
    updatedAt: "2026-06-21T09:00:00Z",
  },
  {
    id: "task-3",
    projectId: "proj-1",
    identifier: "Q2-3",
    title: "Set up analytics dashboard",
    status: "in_progress",
    description: "Connect Mixpanel events for key conversion steps.",
    assignee: "Jordan",
    priority: "high",
    dueDate: "Jun 24",
    createdAt: "2026-06-18T11:00:00Z",
    updatedAt: "2026-06-23T08:00:00Z",
  },
  {
    id: "task-4",
    projectId: "proj-2",
    identifier: "ENT-1",
    title: "Prepare enterprise pricing deck",
    status: "in_progress",
    assignee: "Sam",
    priority: "medium",
    dueDate: "Jun 30",
    createdAt: "2026-06-15T10:00:00Z",
    updatedAt: "2026-06-22T16:00:00Z",
  },
  {
    id: "task-5",
    projectId: "proj-1",
    identifier: "Q2-4",
    title: "Ship beta invite system",
    status: "done",
    assignee: "Alex",
    priority: "low",
    dueDate: "Jun 15",
    createdAt: "2026-06-01T10:00:00Z",
    updatedAt: "2026-06-14T18:00:00Z",
  },
];

export const mockTeamMembers: TeamMember[] = [
  {
    id: "member-1",
    projectId: "proj-1",
    name: "Alex",
    role: "Product Designer",
    email: "alex@acme.co",
  },
  {
    id: "member-2",
    projectId: "proj-1",
    name: "Jordan",
    role: "Engineer",
    email: "jordan@acme.co",
  },
  {
    id: "member-3",
    projectId: "proj-1",
    name: "Sam",
    role: "Marketing Lead",
    email: "sam@acme.co",
  },
  {
    id: "member-4",
    projectId: "proj-2",
    name: "Sam",
    role: "Sales Lead",
    email: "sam@acme.co",
  },
  {
    id: "member-5",
    projectId: "proj-2",
    name: "Alex",
    role: "Solutions Architect",
    email: "alex@acme.co",
  },
];

export const mockContacts: Contact[] = [
  {
    id: "contact-1",
    projectId: "proj-2",
    name: "Morgan Lee",
    company: "Northwind Systems",
    email: "morgan@northwind.io",
    lastActivity: "2h ago",
    notes: "Interested in enterprise tier. Follow up after demo.",
  },
  {
    id: "contact-2",
    projectId: "proj-2",
    name: "Priya Sharma",
    company: "Helix Analytics",
    email: "priya@helix.co",
    lastActivity: "1d ago",
    notes: "Requested custom integration timeline.",
  },
  {
    id: "contact-3",
    projectId: "proj-1",
    name: "Chris Taylor",
    company: "Brightpath",
    email: "chris@brightpath.com",
    lastActivity: "3d ago",
  },
  {
    id: "contact-4",
    projectId: "proj-1",
    name: "Elena Vasquez",
    company: "Summit Labs",
    email: "elena@summit.io",
    lastActivity: "1w ago",
    notes: "Champion for internal rollout.",
  },
];

export const mockSessions: Session[] = [
  {
    id: "session-1",
    projectId: "proj-1",
    title: "Launch checklist review",
    pinned: true,
    updatedAt: "now",
  },
  {
    id: "session-2",
    projectId: "proj-1",
    title: "Onboarding flow brainstorm",
    pinned: false,
    updatedAt: "4h",
  },
  {
    id: "session-3",
    projectId: "proj-2",
    title: "Enterprise pricing strategy",
    pinned: true,
    updatedAt: "1d",
  },
  {
    id: "session-4",
    projectId: "proj-1",
    title: "Weekly sync notes",
    pinned: false,
    updatedAt: "3d",
  },
  {
    id: "session-5",
    projectId: "proj-3",
    title: "Side project ideation",
    pinned: false,
    updatedAt: "1mo",
  },
];

export const mockMessages: Message[] = [
  {
    id: "msg-1",
    sessionId: "session-1",
    role: "user",
    content: "What tasks are blocking the Q2 launch?",
    createdAt: "2026-06-23T09:00:00Z",
  },
  {
    id: "msg-2",
    sessionId: "session-1",
    role: "assistant",
    content:
      "Two items are still open: onboarding wireframes (Q2-1) and the analytics dashboard (Q2-3). The beta invite system shipped last week.",
    createdAt: "2026-06-23T09:00:05Z",
  },
  {
    id: "msg-3",
    sessionId: "session-1",
    role: "user",
    content: "Draft a follow-up for the analytics task owner.",
    createdAt: "2026-06-23T09:05:00Z",
  },
  {
    id: "msg-4",
    sessionId: "session-1",
    role: "assistant",
    content:
      "Hi Jordan — quick check on the analytics dashboard (Q2-3). We're targeting Jun 24 for launch readiness. Let me know if you need help prioritizing Mixpanel events.",
    createdAt: "2026-06-23T09:05:08Z",
  },
];
