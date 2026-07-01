import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock,
  FileText,
  GitBranch,
  GitCommitHorizontal,
  GitPullRequestArrow,
  History,
  Link2,
  ListTodo,
  RotateCcw,
  ShieldCheck,
  Upload,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { TEAM_ROLE_LABEL } from "@/lib/workspace/harness";
import { cn } from "@/lib/utils";
import { useDataStore } from "@/stores/data-store";
import { useSelectionStore } from "@/stores/selection-store";
import type { WorkspaceFileKind } from "@/types";
import type { PromotionSummary, Worktree, WorktreeStatus } from "@/lib/worktree/client";

const reviewerTone: Record<string, string> = {
  approved: "border-success/30 bg-success/10 text-success",
  rejected: "border-destructive/30 bg-destructive/10 text-destructive",
  requested: "border-warning/30 bg-warning/10 text-warning",
};

function PromotionPreview({ summary }: { summary: PromotionSummary }) {
  if (summary.empty) {
    return (
      <p className="text-xs text-muted-foreground">
        Nothing staged yet — add files, datasets, or tasks to build a promotion.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">+{summary.rowsAdded} rows</Badge>
        <Badge variant="outline">+{summary.filesAdded} files</Badge>
        <Badge variant="outline">+{summary.tasksAdded} tasks</Badge>
      </div>
      {summary.datasetChanges.length > 0 ? (
        <ul className="space-y-1.5">
          {summary.datasetChanges.map((change) => (
            <li key={change.name} className="flex items-center justify-between gap-2 text-xs">
              <span className="flex min-w-0 items-center gap-2">
                <Badge
                  variant="outline"
                  className={cn(
                    "shrink-0",
                    change.isNew
                      ? "border-active/30 bg-active-soft text-active"
                      : "border-border text-muted-foreground",
                  )}
                >
                  {change.isNew ? "new" : "append"}
                </Badge>
                <span className="truncate font-medium">{change.name}</span>
              </span>
              <span className="shrink-0 text-muted-foreground">+{change.rowsAdded} rows</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

const fileKindOptions: Array<{ value: WorkspaceFileKind; label: string }> = [
  { value: "csv", label: "CSV" },
  { value: "markdown", label: "Markdown" },
  { value: "text", label: "Text" },
  { value: "link", label: "Link" },
];

const statusTone: Record<WorktreeStatus, string> = {
  draft: "border-border text-muted-foreground",
  in_review: "border-warning/30 bg-warning/10 text-warning",
  promoted: "border-success/30 bg-success/10 text-success",
  discarded: "border-muted text-muted-foreground",
};

function statusLabel(status: string) {
  return status.replace(/_/g, " ");
}

function FileIcon({ kind }: { kind: WorkspaceFileKind }) {
  if (kind === "link") return <Link2 className="size-4 text-active" />;
  return <FileText className="size-4 text-muted-foreground" />;
}

function BranchRow({
  worktree,
  active,
  onSelect,
}: {
  worktree: Worktree;
  active: boolean;
  onSelect: () => void;
}) {
  const stagedCount = worktree.fileIds.length + worktree.stagedTaskIds.length + worktree.datasetIds.length;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-3 border-b border-border/60 px-4 py-3 text-left transition-colors hover:bg-muted/60",
        active && "bg-active-soft",
      )}
    >
      <GitBranch className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{worktree.name}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {worktree.ownerName} · {stagedCount} staged · base v{worktree.baseHeadVersion ?? 0}
        </span>
      </span>
      <Badge variant="outline" className={cn("capitalize", statusTone[worktree.status])}>
        {statusLabel(worktree.status)}
      </Badge>
    </button>
  );
}

export function FilesWorkspace() {
  const { projectId, selectedWorktreeId, selectWorktree } = useSelectionStore();
  const {
    projects,
    tasks,
    workspaceMembers,
    createWorktree,
    getWorktreesByTeam,
    getHeadVersion,
    getHeadVersions,
    getActiveHeadVersion,
    getCanonicalFilesByProject,
    getFilesByWorktree,
    getEffectiveRole,
    canPerform,
    stageFileToWorktree,
    stageTaskToWorktree,
    requestWorktreePromotion,
    approveWorktreePromotion,
    rejectWorktreePromotion,
    summarizePromotionForWorktree,
    pinHeadVersion,
    resumeLatestHead,
  } = useDataStore();

  const project = projects.find((item) => item.id === projectId);
  const workspaceId = project?.workspaceId;
  const role = getEffectiveRole(workspaceId);
  const canStage = canPerform(workspaceId, "stage_work");
  const canApprove = canPerform(workspaceId, "approve_worktree");
  const branches = useMemo(() => getWorktreesByTeam(projectId), [getWorktreesByTeam, projectId]);
  const [activeBranchId, setActiveBranchId] = useState<string | null>(null);
  const activeBranch = branches.find((branch) => branch.id === activeBranchId) ?? branches[0];
  const canonicalFiles = getCanonicalFilesByProject(projectId);
  const stagedFiles = activeBranch ? getFilesByWorktree(activeBranch.id) : [];
  const stagedTasks = activeBranch
    ? tasks.filter((task) => task.worktreeId === activeBranch.id)
    : [];
  const head = getHeadVersion(projectId);
  const activeHead = getActiveHeadVersion(projectId);
  const isRolledBack = Boolean(head && activeHead && activeHead.version !== head.version);
  const headHistory = getHeadVersions(projectId);
  const promotionSummary =
    activeBranch && activeBranch.status !== "promoted" && activeBranch.status !== "discarded"
      ? summarizePromotionForWorktree(activeBranch.id)
      : null;
  const reviewers = workspaceMembers.filter(
    (member) =>
      member.workspaceId === workspaceId && (member.role === "owner" || member.role === "lead"),
  );

  const [branchName, setBranchName] = useState("Q3 operating update");
  const [fileKind, setFileKind] = useState<WorkspaceFileKind>("markdown");
  const [fileName, setFileName] = useState("branch-notes.md");
  const [fileUrl, setFileUrl] = useState("");
  const [fileContent, setFileContent] = useState("Scope, assumptions, and source notes for this branch.");
  const [taskTitle, setTaskTitle] = useState("Review staged branch evidence");
  const [taskAssignee, setTaskAssignee] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [reviewNote, setReviewNote] = useState("Ready for lead review.");

  useEffect(() => {
    if (!activeBranchId && branches[0]) {
      setActiveBranchId(branches[0].id);
    }
    if (activeBranchId && !branches.some((branch) => branch.id === activeBranchId)) {
      setActiveBranchId(branches[0]?.id ?? null);
    }
  }, [activeBranchId, branches]);

  // Honor a deep-link from the Monitor (event → branch), then clear it.
  useEffect(() => {
    if (selectedWorktreeId && branches.some((branch) => branch.id === selectedWorktreeId)) {
      setActiveBranchId(selectedWorktreeId);
      selectWorktree(null);
    }
  }, [selectedWorktreeId, branches, selectWorktree]);

  const handleCreateBranch = () => {
    if (!project || !branchName.trim()) return;
    const branch = createWorktree(project.id, branchName);
    setActiveBranchId(branch.id);
    setBranchName("");
  };

  const needsContent = fileKind === "csv" || fileKind === "markdown" || fileKind === "text";
  const stageFileDisabled =
    !activeBranch ||
    activeBranch.status !== "draft" ||
    !canStage ||
    !fileName.trim() ||
    (fileKind === "link" ? !fileUrl.trim() : needsContent && !fileContent.trim());

  const handleStageFile = () => {
    if (stageFileDisabled || !activeBranch) return;
    stageFileToWorktree(activeBranch.id, {
      name: fileName,
      kind: fileKind,
      content: fileKind === "link" ? undefined : fileContent,
      sourceUrl: fileKind === "link" ? fileUrl : undefined,
    });
    setFileName(fileKind === "csv" ? "data-update.csv" : "branch-notes.md");
    setFileContent("");
    setFileUrl("");
  };

  const handleStageTask = () => {
    if (!activeBranch || !taskTitle.trim()) return;
    stageTaskToWorktree(activeBranch.id, {
      title: taskTitle,
      description: "Promoted from the branch review harness.",
      priority: "medium",
      dueDate: taskDueDate || undefined,
      assignee: taskAssignee || undefined,
    });
    setTaskTitle("");
    setTaskAssignee("");
    setTaskDueDate("");
  };

  const handleRequestReview = () => {
    if (!activeBranch) return;
    requestWorktreePromotion(activeBranch.id, reviewNote);
  };

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Select a team to manage files and branches.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-shell">
      <div className="border-b border-border bg-pane px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Files and branch delivery
            </p>
            <h1 className="mt-1 truncate text-xl font-semibold">{project.name} HEAD</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">
              <ShieldCheck data-icon="inline-start" />
              {TEAM_ROLE_LABEL[role]}
            </Badge>
            <Badge variant="outline">
              <GitCommitHorizontal data-icon="inline-start" />
              HEAD v{activeHead?.version ?? 0}
            </Badge>
            {isRolledBack ? (
              <Badge variant="outline" className="border-warning/30 bg-warning/10 text-warning">
                <RotateCcw data-icon="inline-start" />
                Rolled back from v{head?.version}
              </Badge>
            ) : null}
            <Badge variant="outline">{branches.length} branches</Badge>
          </div>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[300px_minmax(0,1fr)]">
        <aside className="min-h-0 border-r border-border bg-pane">
          <div className="border-b border-border p-3">
            <div className="flex gap-2">
              <Input
                value={branchName}
                onChange={(event) => setBranchName(event.currentTarget.value)}
                placeholder="Branch name"
                disabled={!canStage}
              />
              <Button size="icon-sm" onClick={handleCreateBranch} disabled={!canStage || !branchName.trim()}>
                <GitBranch />
              </Button>
            </div>
          </div>
          <ScrollArea className="h-[calc(100vh-12rem)]">
            {branches.length === 0 ? (
              <div className="px-4 py-8 text-sm text-muted-foreground">
                No branches yet. Create one to stage files and tasks.
              </div>
            ) : (
              branches.map((branch) => (
                <BranchRow
                  key={branch.id}
                  worktree={branch}
                  active={branch.id === activeBranch?.id}
                  onSelect={() => setActiveBranchId(branch.id)}
                />
              ))
            )}
          </ScrollArea>
        </aside>

        <ScrollArea className="min-h-0">
          <div className="grid gap-6 p-5 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-6">
              <section>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold">Canonical files</h2>
                    <p className="text-xs text-muted-foreground">Files promoted into the latest team HEAD.</p>
                  </div>
                  <Badge variant="outline">{canonicalFiles.length}</Badge>
                </div>
                <div className="divide-y divide-border rounded-md border border-border bg-background">
                  {canonicalFiles.length === 0 ? (
                    <div className="px-4 py-8 text-sm text-muted-foreground">
                      No canonical files yet.
                    </div>
                  ) : (
                    canonicalFiles.map((file) => (
                      <div key={file.id} className="grid gap-3 px-4 py-3 md:grid-cols-[20px_1fr_auto]">
                        <FileIcon kind={file.kind} />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{file.name}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {file.kind} · HEAD v{file.headVersion ?? head?.version ?? 0} · {file.createdByName}
                          </p>
                        </div>
                        <Badge variant="secondary">HEAD</Badge>
                      </div>
                    ))
                  )}
                </div>
              </section>

              {activeBranch ? (
                <section>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-sm font-semibold">{activeBranch.name}</h2>
                      <p className="text-xs text-muted-foreground">
                        {activeBranch.ownerName} · {statusLabel(activeBranch.status)}
                        {activeBranch.baseHeadVersion != null
                          ? ` · base v${activeBranch.baseHeadVersion}`
                          : ""}
                      </p>
                    </div>
                  </div>

                  {activeBranch.status === "draft" || activeBranch.status === "in_review" ? (
                    <div className="mb-4 rounded-md border border-border bg-background p-4">
                      <div className="mb-3 flex items-center gap-2">
                        <GitPullRequestArrow className="size-4 text-active" />
                        <h3 className="text-sm font-medium">Promotion preview</h3>
                        <span className="text-xs text-muted-foreground">
                          into HEAD v{(head?.version ?? 0) + 1}
                        </span>
                      </div>
                      {promotionSummary ? <PromotionPreview summary={promotionSummary} /> : null}

                      {activeBranch.reviewers.length > 0 ? (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <span className="text-xs text-muted-foreground">Reviewers:</span>
                          {activeBranch.reviewers.map((reviewer) => (
                            <Badge
                              key={reviewer.id}
                              variant="outline"
                              className={cn("font-normal", reviewerTone[reviewer.status])}
                            >
                              {reviewer.status === "approved" ? (
                                <CheckCircle2 data-icon="inline-start" />
                              ) : reviewer.status === "rejected" ? (
                                <XCircle data-icon="inline-start" />
                              ) : (
                                <Clock data-icon="inline-start" />
                              )}
                              {reviewer.name}
                            </Badge>
                          ))}
                        </div>
                      ) : null}

                      <Separator className="my-3" />

                      {activeBranch.status === "draft" ? (
                        <div className="space-y-2">
                          <Textarea
                            value={reviewNote}
                            onChange={(event) => setReviewNote(event.currentTarget.value)}
                            className="min-h-16 resize-none text-sm"
                            placeholder="Note for reviewers…"
                            disabled={!canStage}
                          />
                          <Button
                            size="sm"
                            className="w-full"
                            onClick={handleRequestReview}
                            disabled={!canStage || !promotionSummary || promotionSummary.empty}
                          >
                            <Upload data-icon="inline-start" />
                            Request review
                          </Button>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => rejectWorktreePromotion(activeBranch.id, "Needs another pass.")}
                          >
                            <XCircle data-icon="inline-start" />
                            Reject
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => approveWorktreePromotion(activeBranch.id)}
                            disabled={!canApprove}
                          >
                            <CheckCircle2 data-icon="inline-start" />
                            Promote to HEAD v{(head?.version ?? 0) + 1}
                          </Button>
                          {!canApprove ? (
                            <span className="text-xs text-muted-foreground">
                              Lead or owner approval required.
                            </span>
                          ) : null}
                        </div>
                      )}
                    </div>
                  ) : null}

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-md border border-border bg-background">
                      <div className="border-b border-border px-4 py-3">
                        <h3 className="text-sm font-medium">Staged files</h3>
                      </div>
                      <div className="divide-y divide-border">
                        {stagedFiles.length === 0 ? (
                          <div className="px-4 py-6 text-sm text-muted-foreground">No files staged.</div>
                        ) : (
                          stagedFiles.map((file) => (
                            <div key={file.id} className="flex items-center gap-3 px-4 py-3">
                              <FileIcon kind={file.kind} />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium">{file.name}</span>
                                <span className="block text-xs text-muted-foreground">{file.kind}</span>
                              </span>
                              <Badge variant="outline">staged</Badge>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="rounded-md border border-border bg-background">
                      <div className="border-b border-border px-4 py-3">
                        <h3 className="text-sm font-medium">Staged tasks</h3>
                      </div>
                      <div className="divide-y divide-border">
                        {stagedTasks.length === 0 ? (
                          <div className="px-4 py-6 text-sm text-muted-foreground">No tasks staged.</div>
                        ) : (
                          stagedTasks.map((task) => (
                            <div key={task.id} className="flex items-center gap-3 px-4 py-3">
                              <ListTodo className="size-4 text-muted-foreground" />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium">{task.title}</span>
                                <span className="block text-xs text-muted-foreground">
                                  {task.identifier}{task.assignee ? ` · ${task.assignee}` : ""}
                                </span>
                              </span>
                              <Badge variant="outline">staged</Badge>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </section>
              ) : null}
            </div>

            <aside className="space-y-5">
              <section className="rounded-md border border-border bg-background p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Upload className="size-4 text-muted-foreground" />
                  <h2 className="text-sm font-semibold">Stage file</h2>
                </div>
                <div className="space-y-3">
                  <select
                    value={fileKind}
                    onChange={(event) => setFileKind(event.currentTarget.value as WorkspaceFileKind)}
                    className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                    disabled={!activeBranch || activeBranch.status !== "draft" || !canStage}
                  >
                    {fileKindOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <Input
                    value={fileName}
                    onChange={(event) => setFileName(event.currentTarget.value)}
                    placeholder="File name"
                    disabled={!activeBranch || activeBranch.status !== "draft" || !canStage}
                  />
                  {fileKind === "link" ? (
                    <Input
                      value={fileUrl}
                      onChange={(event) => setFileUrl(event.currentTarget.value)}
                      placeholder="https://..."
                      disabled={!activeBranch || activeBranch.status !== "draft" || !canStage}
                    />
                  ) : (
                    <Textarea
                      value={fileContent}
                      onChange={(event) => setFileContent(event.currentTarget.value)}
                      placeholder={fileKind === "csv" ? "date,value\n2026-07-01,100" : "File notes"}
                      className="min-h-28 resize-none"
                      disabled={!activeBranch || activeBranch.status !== "draft" || !canStage}
                    />
                  )}
                  <Button className="w-full" onClick={handleStageFile} disabled={stageFileDisabled}>
                    <FileText data-icon="inline-start" />
                    Stage file
                  </Button>
                </div>
              </section>

              <section className="rounded-md border border-border bg-background p-4">
                <div className="mb-3 flex items-center gap-2">
                  <ListTodo className="size-4 text-muted-foreground" />
                  <h2 className="text-sm font-semibold">Stage task</h2>
                </div>
                <div className="space-y-3">
                  <Input
                    value={taskTitle}
                    onChange={(event) => setTaskTitle(event.currentTarget.value)}
                    placeholder="Task title"
                    disabled={!activeBranch || activeBranch.status !== "draft" || !canStage}
                  />
                  <Input
                    value={taskAssignee}
                    onChange={(event) => setTaskAssignee(event.currentTarget.value)}
                    placeholder="Owner name"
                    disabled={!activeBranch || activeBranch.status !== "draft" || !canStage}
                  />
                  <Input
                    value={taskDueDate}
                    onChange={(event) => setTaskDueDate(event.currentTarget.value)}
                    placeholder="Due date"
                    disabled={!activeBranch || activeBranch.status !== "draft" || !canStage}
                  />
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={handleStageTask}
                    disabled={!activeBranch || activeBranch.status !== "draft" || !canStage || !taskTitle.trim()}
                  >
                    <ListTodo data-icon="inline-start" />
                    Stage task
                  </Button>
                </div>
              </section>

              <section className="rounded-md border border-border bg-background p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <History className="size-4 text-muted-foreground" />
                    <h2 className="text-sm font-semibold">HEAD history</h2>
                  </div>
                  {isRolledBack ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => resumeLatestHead(projectId)}
                      disabled={!canApprove}
                    >
                      <RotateCcw data-icon="inline-start" />
                      Resume latest
                    </Button>
                  ) : null}
                </div>
                <div className="space-y-2">
                  {headHistory.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No promoted versions yet.</p>
                  ) : (
                    headHistory.map((version) => {
                      const isActive = version.version === activeHead?.version;
                      const isLatest = version.version === head?.version;
                      return (
                        <div
                          key={version.id}
                          className={cn(
                            "flex items-start justify-between gap-2 rounded-md border-l-2 py-1.5 pl-3 pr-1",
                            isActive ? "border-l-active bg-active-soft/40" : "border-l-border",
                          )}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="truncate text-sm font-medium">{version.label}</p>
                              {isActive ? (
                                <Badge
                                  variant="outline"
                                  className="shrink-0 border-active/30 bg-active-soft text-active"
                                >
                                  Active
                                </Badge>
                              ) : null}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {version.fileIds.length} files · {version.taskIds.length} tasks ·{" "}
                              {version.datasetIds.length} datasets
                            </p>
                          </div>
                          {!isActive && !isLatest ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => pinHeadVersion(projectId, version.version)}
                              disabled={!canApprove}
                              title="Roll back to this version"
                            >
                              <RotateCcw />
                            </Button>
                          ) : null}
                        </div>
                      );
                    })
                  )}
                  {reviewers.length > 0 ? (
                    <p className="pt-1 text-xs text-muted-foreground">
                      Approvers: {reviewers.map((reviewer) => reviewer.name).join(", ")}
                    </p>
                  ) : null}
                </div>
              </section>
            </aside>
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
