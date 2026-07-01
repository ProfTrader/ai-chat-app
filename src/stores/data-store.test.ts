import { afterEach, describe, expect, it } from "vitest";
import { useDataStore } from "@/stores/data-store";
import { currentUser } from "@/lib/current-user";

const TEAM = "proj-risk";
const store = () => useDataStore.getState();

function setCurrentUserRole(role: "owner" | "lead" | "member" | "viewer") {
  useDataStore.setState({
    workspaceMembers: store().workspaceMembers.map((member) =>
      member.userId === currentUser.id ? { ...member, role } : member,
    ),
  });
}

afterEach(() => {
  // Reset the worktree/HEAD slices and role between tests (shared singleton).
  useDataStore.setState({
    worktrees: [],
    headVersions: [],
    workspaceFiles: [],
    activeHeadVersionByTeam: {},
  });
  setCurrentUserRole("owner");
});

describe("data-store CD harness", () => {
  it("blocks staging + branch creation without stage rights", () => {
    setCurrentUserRole("viewer");
    expect(() => store().createWorktree(TEAM, "viewer branch")).toThrow();

    setCurrentUserRole("owner");
    const branch = store().createWorktree(TEAM, "member branch");
    setCurrentUserRole("viewer");
    expect(store().stageFileToWorktree(branch.id, { name: "x.md", kind: "markdown", content: "hi" })).toBeNull();
    expect(store().requestWorktreePromotion(branch.id, "note")).toBeNull();
  });

  it("reclaims staged files/tasks when a branch is discarded", () => {
    const branch = store().createWorktree(TEAM, "throwaway");
    store().stageFileToWorktree(branch.id, { name: "notes.md", kind: "markdown", content: "draft" });
    store().stageTaskToWorktree(branch.id, {
      title: "Staged task",
      description: undefined,
      priority: "medium",
      dueDate: undefined,
      assignee: undefined,
    });
    expect(store().workspaceFiles.some((file) => file.worktreeId === branch.id)).toBe(true);

    store().discardWorktree(branch.id);
    expect(store().workspaceFiles.some((file) => file.worktreeId === branch.id)).toBe(false);
    expect(store().tasks.some((task) => task.worktreeId === branch.id)).toBe(false);
  });

  it("promotes to an immutable HEAD, cleans staged originals, and supports rollback", () => {
    // v1
    const b1 = store().createWorktree(TEAM, "v1 branch");
    store().stageFileToWorktree(b1.id, { name: "a.md", kind: "markdown", content: "a" });
    store().requestWorktreePromotion(b1.id, "ready");
    const v1 = store().promoteWorktree(b1.id);
    expect(v1?.version).toBe(1);
    // Staged original file is gone; a canonical copy remains.
    expect(store().workspaceFiles.some((file) => file.worktreeId === b1.id)).toBe(false);
    expect(store().getCanonicalFilesByProject(TEAM)).toHaveLength(1);

    // v2
    const b2 = store().createWorktree(TEAM, "v2 branch");
    store().stageFileToWorktree(b2.id, { name: "b.md", kind: "markdown", content: "b" });
    store().requestWorktreePromotion(b2.id, "ready");
    const v2 = store().promoteWorktree(b2.id);
    expect(v2?.version).toBe(2);
    expect(store().getCanonicalFilesByProject(TEAM)).toHaveLength(2);
    expect(store().getActiveHeadVersion(TEAM)?.version).toBe(2);

    // Rollback to v1 → active reads follow v1's single-file composition.
    store().pinHeadVersion(TEAM, 1);
    expect(store().getActiveHeadVersion(TEAM)?.version).toBe(1);
    expect(store().getCanonicalFilesByProject(TEAM)).toHaveLength(1);

    // Resume latest.
    store().resumeLatestHead(TEAM);
    expect(store().getActiveHeadVersion(TEAM)?.version).toBe(2);
  });

  it("denies promotion to a member without approve rights", () => {
    const branch = store().createWorktree(TEAM, "needs approval");
    store().stageFileToWorktree(branch.id, { name: "c.md", kind: "markdown", content: "c" });
    store().requestWorktreePromotion(branch.id, "ready");
    setCurrentUserRole("member");
    expect(store().promoteWorktree(branch.id)).toBeNull();
  });
});
