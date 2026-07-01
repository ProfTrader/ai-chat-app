import { create } from "zustand";
import type { Contact, ContextChip, Project, Task, TeamMember } from "@/types";

interface SelectionState {
  workspaceId: string;
  projectId: string;
  sessionId: string | null;
  selectedTaskId: string | null;
  selectedContactId: string | null;
  selectedMemberId: string | null;
  memberFilterId: string | null;
  /** Branch to focus when the Files workspace opens (e.g. from a Monitor event). */
  selectedWorktreeId: string | null;
  contextChips: ContextChip[];
  setWorkspaceId: (id: string) => void;
  setProjectId: (id: string) => void;
  setSessionId: (id: string | null) => void;
  selectWorktree: (id: string | null) => void;
  selectTask: (task: Task | null) => void;
  selectContact: (contact: Contact | null) => void;
  selectMember: (member: TeamMember | null) => void;
  setMemberFilter: (memberId: string | null) => void;
  addContextChip: (chip: ContextChip) => void;
  removeContextChip: (id: string) => void;
  clearContextChips: () => void;
}

export const useSelectionStore = create<SelectionState>((set, get) => ({
  workspaceId: "ws-1",
  projectId: "proj-risk",
  sessionId: null,
  selectedTaskId: null,
  selectedContactId: null,
  selectedMemberId: null,
  memberFilterId: null,
  selectedWorktreeId: null,
  contextChips: [],
  setWorkspaceId: (workspaceId) => set({ workspaceId }),
  setProjectId: (projectId) =>
    set({
      projectId,
      selectedTaskId: null,
      selectedContactId: null,
      selectedMemberId: null,
      memberFilterId: null,
      selectedWorktreeId: null,
    }),
  setSessionId: (sessionId) => set({ sessionId }),
  selectWorktree: (selectedWorktreeId) => set({ selectedWorktreeId }),
  selectTask: (task) =>
    set({
      selectedTaskId: task?.id ?? null,
      selectedContactId: null,
      selectedMemberId: null,
      contextChips: task
        ? [{ id: task.id, label: task.identifier, type: "task" }]
        : get().contextChips,
    }),
  selectContact: (contact) =>
    set({
      selectedContactId: contact?.id ?? null,
      selectedTaskId: null,
      selectedMemberId: null,
      contextChips: contact
        ? [{ id: contact.id, label: contact.name, type: "contact" }]
        : get().contextChips,
    }),
  selectMember: (member) =>
    set({
      selectedMemberId: member?.id ?? null,
      selectedTaskId: null,
      selectedContactId: null,
    }),
  setMemberFilter: (memberFilterId) => set({ memberFilterId }),
  addContextChip: (chip) =>
    set((s) => ({
      contextChips: s.contextChips.some((c) => c.id === chip.id)
        ? s.contextChips
        : [...s.contextChips, chip],
    })),
  removeContextChip: (id) =>
    set((s) => ({ contextChips: s.contextChips.filter((c) => c.id !== id) })),
  clearContextChips: () => set({ contextChips: [] }),
}));

export function setProjectContext(project: Project) {
  useSelectionStore.getState().setProjectId(project.id);
  useSelectionStore.getState().addContextChip({
    id: project.id,
    label: project.name,
    type: "project",
  });
}
