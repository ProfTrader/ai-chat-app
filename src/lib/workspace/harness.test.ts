import { describe, expect, it } from "vitest";
import { canRolePerform, canonicalTasksForProject, stagedTasksForWorktree } from "@/lib/workspace/harness";
import type { Task } from "@/types";

const task = (patch: Partial<Task>): Task => ({
  id: patch.id ?? "task-1",
  projectId: patch.projectId ?? "proj-risk",
  identifier: patch.identifier ?? "PRJ-1",
  title: patch.title ?? "Task",
  status: patch.status ?? "todo",
  createdAt: patch.createdAt ?? "2026-07-01T00:00:00.000Z",
  updatedAt: patch.updatedAt ?? "2026-07-01T00:00:00.000Z",
  ...patch,
});

describe("workspace harness", () => {
  it("keeps high-risk promotion approval out of member roles", () => {
    expect(canRolePerform("owner", "approve_worktree")).toBe(true);
    expect(canRolePerform("lead", "approve_worktree")).toBe(true);
    expect(canRolePerform("member", "approve_worktree")).toBe(false);
    expect(canRolePerform("viewer", "stage_work")).toBe(false);
  });

  it("separates canonical board tasks from branch-staged tasks", () => {
    const tasks = [
      task({ id: "canonical", title: "Canonical task" }),
      task({ id: "staged", title: "Staged task", worktreeId: "wt-1" }),
      task({ id: "other", projectId: "proj-sales" }),
    ];

    expect(canonicalTasksForProject(tasks, "proj-risk").map((item) => item.id)).toEqual([
      "canonical",
    ]);
    expect(stagedTasksForWorktree(tasks, "wt-1").map((item) => item.id)).toEqual(["staged"]);
  });
});
