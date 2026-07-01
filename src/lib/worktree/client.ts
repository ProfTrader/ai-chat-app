/**
 * Worktree + HEAD model — git-style data delivery for a team's reference data.
 *
 *   Workspace → Team → HEAD (canonical, versioned)   ← references build on this
 *                    └ Worktrees (per-user staging branches)
 *
 * A user uploads files into their own **worktree** (isolated, never touches
 * HEAD), iterates/previews there, then requests a **promotion**. On approval the
 * worktree is **merged into a new immutable HEAD version** (append rows for
 * same-schema datasets, add net-new ones). Everything downstream — insights,
 * plans, briefs — reads the latest HEAD (or a pinned version → rollback).
 *
 * This file holds the pure types + the deterministic merge harness. The store
 * (data-store) owns persistence and the CD pipeline actions.
 */

import type { ProjectDataset, Task, WorkspaceFile } from "@/types";

export type WorktreeStatus = "draft" | "in_review" | "promoted" | "discarded";

export interface WorktreeReviewer {
  id: string;
  name: string;
  status: "requested" | "approved" | "rejected";
  reviewedAt?: string;
}

export interface Worktree {
  id: string;
  /** The team this branch belongs to (= projectId). */
  teamId: string;
  name: string;
  ownerId: string;
  ownerName: string;
  status: WorktreeStatus;
  /** HEAD version this branch started from. */
  baseHeadVersion?: number;
  /** Datasets staged in this worktree (isolated from HEAD). */
  datasetIds: string[];
  /** Files staged in this worktree (isolated from HEAD). */
  fileIds: string[];
  /** Proposed tasks staged in this worktree (isolated from the canonical board). */
  stagedTaskIds: string[];
  reviewers: WorktreeReviewer[];
  note?: string;
  createdAt: string;
  updatedAt: string;
  requestedAt?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  rejectionReason?: string;
  /** HEAD version this worktree merged into, once promoted. */
  promotedToVersion?: number;
}

export interface HeadVersion {
  id: string;
  teamId: string;
  /** Monotonic version number per team (1, 2, 3 …). */
  version: number;
  label: string;
  /** Datasets composing this immutable HEAD snapshot. */
  datasetIds: string[];
  /** Files composing this immutable HEAD snapshot. */
  fileIds: string[];
  /** Tasks composing this immutable HEAD snapshot. */
  taskIds: string[];
  sourceWorktreeId?: string;
  note?: string;
  createdBy: string;
  createdAt: string;
  parentVersion?: number;
}

export const WORKTREE_STATUS_LABEL: Record<WorktreeStatus, string> = {
  draft: "Draft",
  in_review: "In review",
  promoted: "Promoted",
  discarded: "Discarded",
};

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export interface PromotedHead {
  /** New dataset records to insert into the store (immutable snapshots). */
  newDatasets: ProjectDataset[];
  /** Full dataset id list for the new HEAD version (shared + new). */
  datasetIds: string[];
}

/**
 * Build the dataset set for a new HEAD version by merging a worktree into the
 * previous HEAD. Same-name datasets get their rows appended (a fresh snapshot);
 * net-new datasets are promoted in; unchanged HEAD datasets are shared by id
 * (no needless copies). Pure — the store supplies id/time generators.
 */
export function buildPromotedHead(input: {
  version: number;
  headDatasets: ProjectDataset[];
  worktreeDatasets: ProjectDataset[];
  makeId: (prefix: string) => string;
  now: string;
}): PromotedHead {
  const { version, headDatasets, worktreeDatasets, makeId, now } = input;
  const usedWorktree = new Set<string>();
  const newDatasets: ProjectDataset[] = [];
  const datasetIds: string[] = [];

  for (const head of headDatasets) {
    const match = worktreeDatasets.find(
      (w) => !usedWorktree.has(w.id) && normalizeName(w.name) === normalizeName(head.name),
    );
    if (!match) {
      // Unchanged in this promotion — share the existing snapshot by id.
      datasetIds.push(head.id);
      continue;
    }
    usedWorktree.add(match.id);
    const merged: ProjectDataset = {
      ...head,
      id: makeId("dataset"),
      worktreeId: undefined,
      headVersion: version,
      rows: [...head.rows, ...match.rows],
      createdAt: now,
      updatedAt: now,
    };
    newDatasets.push(merged);
    datasetIds.push(merged.id);
  }

  for (const w of worktreeDatasets) {
    if (usedWorktree.has(w.id)) continue;
    const promoted: ProjectDataset = {
      ...w,
      id: makeId("dataset"),
      worktreeId: undefined,
      headVersion: version,
      createdAt: now,
      updatedAt: now,
    };
    newDatasets.push(promoted);
    datasetIds.push(promoted.id);
  }

  return { newDatasets, datasetIds };
}

/** Short, human label for a promotion, e.g. `v3 — merged "Q1 actuals"`. */
export function headVersionLabel(version: number, worktreeName: string): string {
  return `v${version} — merged "${worktreeName.trim() || "worktree"}"`;
}

/** One dataset's contribution to a promotion — either rows appended or net-new. */
export interface PromotionDatasetChange {
  name: string;
  /** true ⇒ this dataset does not exist on HEAD and will be added whole. */
  isNew: boolean;
  /** Rows this promotion adds (all rows for net-new, staged rows for appends). */
  rowsAdded: number;
}

/**
 * Pre-promotion diff — what merging a worktree into HEAD would change. Pure and
 * side-effect free so the UI can preview it before the user approves. Mirrors
 * the merge rules in {@link buildPromotedHead}: same-name datasets append rows,
 * unmatched staged datasets are net-new.
 */
export interface PromotionSummary {
  datasetChanges: PromotionDatasetChange[];
  filesAdded: number;
  tasksAdded: number;
  rowsAdded: number;
  /** True when nothing is staged — promotion would be a no-op. */
  empty: boolean;
}

export function summarizePromotion(input: {
  headDatasets: ProjectDataset[];
  worktreeDatasets: ProjectDataset[];
  stagedFiles: WorkspaceFile[];
  stagedTasks: Task[];
}): PromotionSummary {
  const { headDatasets, worktreeDatasets, stagedFiles, stagedTasks } = input;
  const headNames = new Set(headDatasets.map((d) => normalizeName(d.name)));
  const datasetChanges: PromotionDatasetChange[] = worktreeDatasets.map((d) => ({
    name: d.name,
    isNew: !headNames.has(normalizeName(d.name)),
    rowsAdded: d.rows.length,
  }));
  const rowsAdded = datasetChanges.reduce((sum, change) => sum + change.rowsAdded, 0);
  return {
    datasetChanges,
    filesAdded: stagedFiles.length,
    tasksAdded: stagedTasks.length,
    rowsAdded,
    empty:
      datasetChanges.length === 0 && stagedFiles.length === 0 && stagedTasks.length === 0,
  };
}
