# Nexus CRM Handoff

## Current State

Nexus CRM is a local-first AI workspace where chat drives planning, tasks, briefs, email, team context, and project artifacts. The app runs as two local processes:

- Web app: Vite on `http://127.0.0.1:1420`
- API server: Hono on `http://127.0.0.1:3001`

The active branch at handoff is `sync/nexus-build`.

## Setup

```bash
npm install
cp .env.example .env
cp server/.env.example server/.env
npm run dev:all
```

Required environment:

```ini
MOONSHOT_API_KEY=sk-...
MOONSHOT_MODEL=kimi-k2.7-code
MOONSHOT_FAST_MODEL=kimi-k2.7-code-highspeed
MOONSHOT_REASONING_MODEL=kimi-k2.7-code
PORT=3001
```

Notes:

- `.env`, `server/.env`, `.data/`, browser IndexedDB, and local chat state are not synced through git.
- `OLLAMA_MODEL` should stay empty unless intentionally using an Ollama fallback.
- The root `.env` is loaded first and wins over `server/.env`.

## Done

### Plan Mode

- Reworked Plan mode into one deterministic intake flow.
- New planning requests no longer depend on the model to decide what questions to ask.
- Plan intake now asks exactly three app-generated multiple-choice questions:
  1. Launch objective
  2. Monthly budget
  3. Go-to-market motion
- Each question renders in the chat and in the inline composer plan card with matching options.
- After the third answer, the app summarizes the intake and automatically drafts the editable plan.
- Added `/api/plan` for model-backed structured plan generation.
- Added editable plan artifact rendering with title, summary, steps, assumptions, `Discard`, and `Build plan`.
- Fixed the previous loop where the model kept asking questions and never generated the plan.
- Fixed the issue where Q2 did not show answer options.
- Fixed the earlier `/api/plan` 404 by restarting the stale API process and verifying the endpoint.

### Chat UX

- Cleaned up chat bubble alignment and sizing.
- Restored the user avatar beside user messages.
- Added a generated Dexter avatar asset at `src/assets/dexter-avatar.png`.
- Improved focus behavior so the composer regains cursor focus after AI responses.
- Added message queueing while the model is responding; the composer remains usable during generation.
- Added Plan/Auto slash command support and composer status affordances.
- Improved reaction controls and message metadata handling.

### Mentions And Team UI

- Improved `@` mention handling so mentions are treated as highlighted UI tokens rather than plain text.
- Added teammate hover/summary behavior patterns in the inspector/team surfaces.
- Added/updated project inspector and related team/project panels.

### Theme And Visual Polish

- Kept Studio Dark as the baseline theme.
- Adjusted theme coordination across non-dark themes.
- Fixed the light-theme scrollbar/black-rectangle issue.
- Polished sidebar, workspace, inbox, inspector, composer, and chat message styling.

### Model Configuration

- Configured Moonshot/Kimi model routing:
  - Default/reasoning: `kimi-k2.7-code`
  - Fast: `kimi-k2.7-code-highspeed`
- Hardened Moonshot response parsing for non-streaming and JSON-like responses.
- Added stronger Plan mode prompt contracts as a fallback, although deterministic intake now owns the flow.

### New Files And Areas

- `server/routes/plan.ts`
- `src/lib/plan/client.ts`
- `src/components/workspace/plan-artifact.tsx`
- `src/components/composer/plan-intake-card.tsx`
- `src/components/composer/composer-slash-menu.tsx`
- `src/components/composer/composer-status.tsx`
- `src/assets/dexter-avatar.png`
- Additional automation, deliverable, schedule, and project-panel components.

## Verification Completed

Commands:

```bash
npm run build
```

Result:

- TypeScript passed.
- Vite production build passed.
- Vite still reports a large bundle warning for the main JS chunk; this is not a functional failure.

Manual computer-use verification:

- Opened Chrome to `http://127.0.0.1:1420`.
- Refreshed stale auth state and confirmed the composer was connected.
- Sent this prompt:

```text
Create a marketing launch plan for Brightpath Labs. We sell AI intake and document-review tools to solo and small law firms. Goal: land the first 50 paying firms.
```

- Confirmed Q1 rendered with four choices.
- Confirmed Q2 rendered with four choices.
- Confirmed Q3 rendered with four choices.
- Confirmed the third answer triggered "Generating the editable plan now."
- Confirmed the editable plan artifact rendered automatically with six editable steps, assumptions, and `Build plan`.
- Confirmed direct `POST http://127.0.0.1:3001/api/plan` returned `200`.

## Known Follow-Ups

- Add automated Playwright coverage for the full Plan mode path:
  - prompt
  - Q1/Q2/Q3 choices
  - auto plan generation
  - editable artifact rendering
  - Build plan task creation
- Verify `Build plan` end-to-end on a real project board after plan approval.
- Add tests for composer queueing during active model responses.
- Add tests for cursor focus restoration after streaming/model completion.
- Deep QA mention tokens:
  - keyboard navigation
  - deletion behavior
  - hover card placement
  - mobile behavior
- Continue theme QA for all non-Studio-Dark themes.
- Consider route-level or component-level code splitting to address the Vite large chunk warning.
- Decide whether local IndexedDB/chat state should ever be exportable/importable for machine sync.

## Operational Notes

- If the UI shows `Configure a chat provider to enable chat` while `/api/auth/status` says connected, refresh the browser tab. This happened once during verification due to stale client state.
- If `/api/plan` returns 404, an older API process is still running. Stop the process on port `3001` and restart `npm run dev:server`.
- Local scratch tooling output such as `.playwright-cli/` should not be committed.

## Useful Commands

```bash
npm run dev:all
npm run dev:web
npm run dev:server
npm run build
curl http://127.0.0.1:3001/api/health
curl http://127.0.0.1:3001/api/auth/status
```
