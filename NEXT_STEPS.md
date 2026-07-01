# Next steps — Workspace CD harness

Snapshot of where the git-style data-delivery architecture stands and what to pick
up next. Branch: `sync/nexus-build`.

## What's done

**Model / store (`src/stores/data-store.ts`, `src/lib/worktree/client.ts`, `src/lib/workspace/harness.ts`)**
- Worktree → HEAD versioning: per-user staging branches merge into immutable,
  versioned HEAD snapshots with lineage (`parentVersion`). Same-name datasets
  append rows; net-new datasets promote in.
- **RBAC enforced at the store boundary** (not just UI): `stage_work` gates
  create/stage/request-review; `approve_worktree` gates promote/pin/rollback.
- **Orphan cleanup**: staged datasets/files/tasks are reclaimed on promote (once
  immutable snapshots exist) and on discard.
- **Rollback**: per-team active-HEAD pointer (`activeHeadVersionByTeam`, persisted).
  `pinHeadVersion` / `resumeLatestHead` / `getActiveHeadVersion`; canonical
  file/dataset readers follow the active version. Rollback does NOT fork history
  and auto-resumes to latest on the next promotion.
- Simulated Slack/GitHub/webhook gateway metadata (no real OAuth/webhook sync).

**UI**
- `src/components/workspace/files-workspace.tsx`: branch list, staging, promotion
  **diff preview**, per-reviewer approval chips, relocated review note, clickable
  **HEAD history with rollback / resume-latest / active** indicator, empty-input guards.
- `src/components/workspace/timeline-workspace.tsx` (Monitor): source filter chips
  (Slack/GitHub/Webhook/Nexus/System) + branch **click-through** into Files (via
  `selectedWorktreeId` on the selection store) + external-source links.

**Tests (`vitest`)** — 9 passing:
- `src/lib/worktree/client.test.ts` — promotion merge + promotion summary.
- `src/lib/workspace/harness.test.ts` — RBAC matrix + staged-vs-canonical tasks.
- `src/stores/data-store.test.ts` — RBAC-denied mutations, orphan cleanup, pin/rollback.

**Verification**: `npm test` ✅ · `npx tsc --noEmit` ✅ · `npm run build` ✅

## To do next (priority order)

1. **Separation of duties** — requester should not approve their own worktree.
   Deferred because it breaks the current single-user demo (you'd never promote
   your own branch). Add a workspace toggle so multi-user enforces it while the
   demo stays usable. Reviewer identity is already surfaced in the UI.

2. **Split `data-store.ts` (~3k lines)** — extract the worktree/HEAD/CD concern
   into its own zustand slice or module. Biggest maintainability item; likely the
   driver of the >500 kB main-chunk build warning.

3. **`timeline` → `monitor` rename** — the ViewType key is still `"timeline"` but
   labeled/behaving as "Monitor" (`TimelineWorkspace`, `timeline-workspace.tsx`).
   Rename across `types/index.ts`, `nav-sidebar.tsx`, `main-workspace.tsx`,
   `shell-store.ts`, `use-keyboard-shortcuts.ts`.

4. **Real gateway sync** — replace simulated Slack/GitHub/webhook metadata with
   actual OAuth + webhook ingestion in `server/routes/gateway.ts`. Events already
   flow into the Monitor ledger; the intake is the missing piece.

5. **HEAD history depth** — version diff view (compare v(n) vs v(n-1)), and pinning
   a version for downstream reads beyond the current rollback pointer.

## Known, pre-existing (not regressions)
- `npm audit` reports 4 findings.
- Vite warns about the large main chunk (see item 2).

## Run locally
- `npm run dev` (or the project's dev script) → frontend on `http://127.0.0.1:1420/`,
  API on `http://localhost:3001`.
- `npm test` — vitest. `npx tsc --noEmit` — typecheck. `npm run build` — prod build.
