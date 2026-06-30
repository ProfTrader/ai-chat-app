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

import type { ProjectDataset } from "@/types";

export type WorktreeStatus = "draft" | "in_review" | "promoted" | "discarded";

export interface Worktree {
  id: string;
  /** The team this branch belongs to (= projectId). */
  teamId: string;
  name: string;
  ownerId: string;
  ownerName: string;
  status: WorktreeStatus;
  /** Datasets staged in this worktree (isolated from HEAD). */
  datasetIds: string[];
  note?: string;
  createdAt: string;
  updatedAt: string;
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
