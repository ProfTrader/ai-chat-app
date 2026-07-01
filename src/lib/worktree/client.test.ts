import { describe, expect, it } from "vitest";
import { buildPromotedHead, summarizePromotion } from "@/lib/worktree/client";
import type { ProjectDataset } from "@/types";

const dataset = (patch: Partial<ProjectDataset>): ProjectDataset => ({
  id: patch.id ?? "dataset-1",
  projectId: patch.projectId ?? "proj-risk",
  name: patch.name ?? "Revenue",
  domainId: patch.domainId ?? "general",
  sourceKind: patch.sourceKind ?? "csv",
  columns: patch.columns ?? [
    { key: "date", label: "Date", type: "date", missingRate: 0, sampleValues: ["2026-07-01"] },
    { key: "sales", label: "Sales", type: "number", semanticRole: "sales", missingRate: 0, sampleValues: ["100"] },
  ],
  rows: patch.rows ?? [{ date: "2026-07-01", sales: 100 }],
  createdAt: patch.createdAt ?? "2026-07-01T00:00:00.000Z",
  updatedAt: patch.updatedAt ?? "2026-07-01T00:00:00.000Z",
  ...patch,
});

describe("worktree promotion merge", () => {
  it("appends same-name staged rows and promotes net-new datasets", () => {
    let next = 0;
    const result = buildPromotedHead({
      version: 2,
      headDatasets: [dataset({ id: "head-revenue", name: "Revenue" })],
      worktreeDatasets: [
        dataset({ id: "wt-revenue", name: "revenue", rows: [{ date: "2026-07-02", sales: 120 }] }),
        dataset({ id: "wt-cost", name: "Cost", rows: [{ date: "2026-07-02", sales: 80 }] }),
      ],
      makeId: (prefix) => `${prefix}-${++next}`,
      now: "2026-07-02T00:00:00.000Z",
    });

    expect(result.datasetIds).toEqual(["dataset-1", "dataset-2"]);
    expect(result.newDatasets).toHaveLength(2);
    expect(result.newDatasets[0].rows).toHaveLength(2);
    expect(result.newDatasets[0].worktreeId).toBeUndefined();
    expect(result.newDatasets[1].headVersion).toBe(2);
  });
});

describe("promotion summary", () => {
  it("flags net-new vs appended datasets and counts staged rows/files/tasks", () => {
    const summary = summarizePromotion({
      headDatasets: [dataset({ id: "head-revenue", name: "Revenue" })],
      worktreeDatasets: [
        dataset({ id: "wt-revenue", name: "revenue", rows: [{ date: "x", sales: 1 }, { date: "y", sales: 2 }] }),
        dataset({ id: "wt-cost", name: "Cost", rows: [{ date: "z", sales: 3 }] }),
      ],
      stagedFiles: [{ id: "f1" } as never],
      stagedTasks: [{ id: "t1" } as never, { id: "t2" } as never],
    });

    expect(summary.empty).toBe(false);
    expect(summary.datasetChanges).toEqual([
      { name: "revenue", isNew: false, rowsAdded: 2 },
      { name: "Cost", isNew: true, rowsAdded: 1 },
    ]);
    expect(summary.rowsAdded).toBe(3);
    expect(summary.filesAdded).toBe(1);
    expect(summary.tasksAdded).toBe(2);
  });

  it("reports empty when nothing is staged", () => {
    const summary = summarizePromotion({
      headDatasets: [],
      worktreeDatasets: [],
      stagedFiles: [],
      stagedTasks: [],
    });
    expect(summary.empty).toBe(true);
  });
});
