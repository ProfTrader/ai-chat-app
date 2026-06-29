# Nexus CRM — Architecture

How the app is built and how a request flows end-to-end. Pair this with **HANDOFF.md** (setup/run).

---

## 1. Stack

| Layer | Tech |
| --- | --- |
| Web UI | React 19, Vite 7, TypeScript, Tailwind CSS v4 (OKLCH design tokens), shadcn/Base-UI components |
| State | Zustand stores (some persisted) |
| Chat | Vercel **AI SDK** (`@ai-sdk/react` `useChat`) over a UI message stream |
| API server | **Hono** on Node (`@hono/node-server`), port 3001 |
| LLM | **Moonshot / Kimi** (`kimi-k2.7` → aliased to `kimi-k2.7-code`) via OpenAI-compatible REST; Ollama optional fallback |
| Persistence | Browser **IndexedDB** (+ localStorage fallback); server `.data/*` files; Tauri **SQLite** in desktop builds |
| Desktop (optional) | Tauri 2 |

---

## 2. Big picture

```
┌────────────────────────── Browser (Vite :1420) ──────────────────────────┐
│  App.tsx ─ OnboardingFlow (first run) ─ AppShell                          │
│    AppShell: [ NavSidebar | MainWorkspace | InspectorPanel(Agent Brain) ] │
│                                                                           │
│  Zustand stores: data · selection · shell · chat · auth · onboarding      │
│  ChatSessionProvider ── useChat ──► POST /api/chat (streamed UI messages) │
│  Persistence: browser-db (IndexedDB) + localStorage                       │
└───────────────────────────────┬───────────────────────────────────────────┘
                                 │  /api/*  (Vite proxy → 3001)
┌───────────────────────────────▼───────────── Hono API (:3001) ───────────┐
│ /api/auth      session + which model is active                            │
│ /api/chat      streams the conversation from Moonshot                     │
│ /api/clarify   structured multiple-choice intake questions (JSON)         │
│ /api/tasks     task breakdown for the board (JSON)                        │
│ /api/email     email draft (JSON)                                         │
│ /api/onboarding research the firm + save/serve firm-profile.json/.html    │
│ /api/agent-files  read/write the 5 agent brain files (.data/agent/*.md)    │
│ /api/agent     brief artifact generation (currently dormant)              │
│ lib: moonshot · ollama · auth · context (prompt) · firm-profile · agent-files │
└───────────────────────────────┬───────────────────────────────────────────┘
                                 │  HTTPS (Bearer key)
                         Moonshot API  (api.moonshot.ai/v1)
```

---

## 3. The product flow

```
Onboarding ──► Firm profile (the "soul")         (research via /api/onboarding/research)
                     │  saved to .data/firm-profile.{json,html}
                     ▼
            Team projects (Risk/Marketing/Ops/Sales/Product)
                     │
                     ▼
   CHAT (the hub)  ──► agent grounds every reply in FIRM MEMORY
        │
        ├─ "plan/brief/build…"  ──► interactive multiple-choice questions (card)
        │         └─ user taps answers ──► task-proposal FLOW
        │                                    ├─ "Add to board" ⇒ tasks (team-assigned)
        │                                    │      + brief linked to a task
        │                                    │      + notifications ──► INBOX
        │                                    └─ premise .md on the canvas ──► Socratic confirm
        │                                           └─ "how to deliver?" card ⇒ saved to memory.md
        ├─ "create tasks…"      ──► task proposal card ──► board
        ├─ ✉ Draft email        ──► email artifact card (copy / open in mail)
        └─ 📎 drag files         ──► attachments sent as context
```

Each project has the file-style tabs: **Chat · Briefs · Tasks · Board · Team**. Chat is primary; the
others are populated *from* chat.

---

## 4. Frontend structure

### Stores (`src/stores`)
- **data-store** — the workspace database: projects, sessions, messages, tasks, team, **notifications**,
  agent-brain runs, etc. Loads from IndexedDB/localStorage, persists on every mutation
  (`persistLocal`). Holds the **seed/migration** logic (`hydratePersistedData`,
  `ARTIFACT_SCHEMA_VERSION`, `defaultProjects` = the team template). Migration is **non-destructive**
  for schema ≥7 (keeps the user's projects/chats, just adds the team projects).
- **selection-store** — current workspace/project/session/contextChips (not persisted).
- **shell-store** — UI: activeView, sidebarMode (`chat` | `inbox` | `projects`), panel sizes, open dialogs
  (persisted as `crm-shell`).
- **chat-store** — composer text, mode (Plan/Auto), and **attachments**.
- **auth-store** — model/provider connection status (from `/api/auth/status`).
- **onboarding-store** — `completed` flag + answers + profile (persisted as `crm-onboarding`).

### Chat pipeline
`ChatSessionProvider` ([src/lib/chat/chat-session-provider.tsx](src/lib/chat/chat-session-provider.tsx))
wraps the AI SDK `useChat`:
- `transport` builds the request body: the user messages **plus** a context pack (project tasks,
  team, datasets, memories, recent messages — markers stripped) so the model is grounded.
- `send(text)` decides the route by intent:
  1. `shouldRouteToTasks` → **task proposal** artifact
  2. `shouldClarify` → **interactive questions** (`runClarify`)
  3. otherwise → normal streamed chat (`chat.sendMessage`)
- Other actions: `composeEmail`, `proposeTasks`, `runClarify`/`submitClarifyAnswers`.
- The composer ([chat-composer.tsx](src/components/composer/chat-composer.tsx)) auto-creates a session
  if none exists (queues the send), and renders the attach/email/tasks buttons + drag-drop.

### Inline artifacts — the marker convention
Artifacts are embedded in assistant/user message text and rendered inline by
[chat-message.tsx](src/components/workspace/chat-message.tsx):

```
[[nexus:<kind>:<base64-json>]]
```

| kind | component | source |
| --- | --- | --- |
| `files` / `fileblock` | attachment chips | [lib/chat/attachments.ts](src/lib/chat/attachments.ts) |
| `ask` | InteractiveQuestions | [lib/clarify/client.ts](src/lib/clarify/client.ts) |
| `tasks` | TaskProposalArtifact | [lib/tasks/client.ts](src/lib/tasks/client.ts) |
| `email` | EmailArtifact | [lib/email/client.ts](src/lib/email/client.ts) |
| `doc` | DocArtifact (premise `.md` on a canvas + download) | [lib/docs/client.ts](src/lib/docs/client.ts) |
| `deliver` | DeliveryChoice (how to deliver the premise) | [lib/docs/client.ts](src/lib/docs/client.ts) |
| `view-brief` | "View on canvas" link | brief flow (dormant) |

`stripNexusMarkers()` removes these for display, titles, and the model context.

The **clarify → premise → deliver** flow (in `chat-session-provider.tsx`): after the intake answers
the agent proposes tasks, then writes a `doc` (the premise) to the canvas and a `deliver` card; the
chosen delivery option is saved to the agent's `memory.md` and executed.

### Views (`src/components/workspace`)
`MainWorkspace` switches on `activeView`: **chat** (or **InboxWorkspace** when sidebarMode=inbox),
**briefs**, **tasks**, **board** (kanban), **contacts/team**, **timeline**, **nodes** (Agent builder /
xyflow). The right **InspectorPanel** shows the **Agent Brain** run timeline.

---

## 5. Backend (`server`)

`server/index.ts` mounts Hono routes and loads env (`.env` then `server/.env`). Each artifact route
follows the same shape: resolve a model (Moonshot-first, Ollama fallback) → prompt with the **firm
profile** → parse strict JSON → return.

- **`/api/chat`** ([routes/chat.ts](server/routes/chat.ts)) — streams the conversation. Loads the saved
  firm profile and injects it; builds the system prompt in
  [lib/context.ts](server/lib/context.ts) (`buildSystemPrompt`).
- **`/api/clarify`** — returns `{ intro, questions[{prompt, options[], multi}], cta }`.
- **`/api/tasks/propose`** — returns `{ tasks[{title, description, priority, status, assignee, dueDate}] }`.
- **`/api/email/draft`** — returns `{ to, subject, body }`.
- **`/api/onboarding`** — `research` (build profile), `PUT/GET profile`, `GET profile.html`.
  Saving the profile also re-seeds `soul-of-firm.md` (`syncSoulOfFirmFromProfile`).
- **`/api/agent-files`** ([routes/agent-files.ts](server/routes/agent-files.ts)) — `GET` list, `GET/PUT
  :name`, `POST :name/append`. Backs the Settings "Agent brain files" panel and the agent's self-updates.
- **`lib/moonshot.ts`** — the streaming + completion calls. kimi-k2 needs `temperature:1` and
  `max_completion_tokens: 8192`.
- **`lib/firm-profile.ts`** — read/write `.data/firm-profile.{json,html}` and the prompt block.
- **`lib/agent-files.ts`** — read/write/seed the 5 `.data/agent/*.md` files + `agentFilesPromptBlock()`
  (the authoritative soul+memory block injected into every system prompt).
- **`lib/auth.ts`** — model/key resolution; `resolveMoonshotModel` aliases `kimi-k2.7`→`kimi-k2.7-code`
  and ignores non-Moonshot model names (so a stale `OLLAMA_MODEL` from a client can't break chat).

---

## 6. Personalization — "soul of the firm" + the agent brain files

Onboarding researches the business and persists a **firm profile** server-side. On **every** chat
message, `/api/chat` loads it and injects a `FIRM MEMORY` block into the system prompt, so replies,
emails, questions, and task breakdowns all reference the firm's industry, goals, ICP, and competitors
by name. The workspace itself starts empty (no mock CRM data) — the agent only references real data in
the context pack.

On top of that, the agent carries **five editable markdown files** (`.data/agent/`, surfaced in
**Settings → Agent brain files**), injected via `agentFilesPromptBlock()`:

- `soul-of-agent.md` — identity, values, voice, boundaries (separated from task context).
- `soul-of-firm.md` — the firm's living soul (re-seeded from onboarding unless hand-edited).
- `agents.md` — the operating manual (the clarify→premise→deliver workflow, skills, house rules).
- `memory.md` — durable facts + preferences; the agent **appends** on stated preferences and delivery choices.
- `session.md` — a running session log appended after each premise is delivered.

Pattern (Hermes-agent style): **identity** (soul) is kept separate from **learned facts** (memory)
from **procedure** (agents.md). Users can edit any file to steer the agent; an "agent" badge marks
files the agent last touched.

---

## 7. Persistence layers

- **Web**: `data-store` ⇄ `lib/browser-db` (IndexedDB key `crm-data`), with `localStorage` backup.
  `hydratePersistedData` runs the schema migration on load.
- **Firm files**: `.data/firm-profile.json` + `.html` on the server (gitignored).
- **Desktop (Tauri)**: `lib/db/index.ts` uses SQLite (`crm.db`); seeds only a clean default workspace.

---

## 8. Directory map

```
src/
  App.tsx                      app root (+ OnboardingFlow overlay)
  components/
    layout/   app-shell, icon-rail, theme-toggle, status-bar
    sidebar/  nav-sidebar (projects, sessions, archive, account menu)
    composer/ chat-composer (send, attach, email, tasks, drag-drop)
    workspace/ chat-thread, chat-message, kanban-board, task-list,
               inbox-workspace, interactive-questions, task-proposal-artifact,
               email-artifact, doc-artifact, delivery-choice,
               briefs-workspace, node-manager (agent builder)
    settings/ settings-sheet, cursor/openai auth panels, agent-files-panel
    onboarding/ onboarding-flow
    inspector/ inspector-panel, agent-brain-panel
    ui/       shadcn primitives (bubble, attachment, message, button, …)
  lib/
    chat/     chat-session-provider, attachments
    clarify/  tasks/  email/  onboarding/   (per-artifact API clients + markers)
    docs/         premise-doc + delivery markers (encode/parse, buildPremiseMarkdown)
    agent-files/  client for the 5 agent brain files
    db/  browser-db/   firm-profile (client side via onboarding)
    agents/   brain, runtime, knowledge-packs (legacy brief/agent engine)
  stores/     data, selection, shell, chat, auth, onboarding
  styles/globals.css   Tailwind v4 + OKLCH tokens (dark "Studio" theme; .fade-text-r helper)
  types/index.ts       shared types (Task, Project, AppNotification, …)
server/
  index.ts             Hono app + route mounting
  routes/   auth, chat, clarify, tasks, email, onboarding, agent, agent-files, gateway
  lib/      moonshot, ollama, auth, context, firm-profile, agent-files, cursor
.data/                 server state (gitignored)
  firm-profile.{json,html}     the firm "soul" from onboarding
  agent/*.md + .meta.json      the 5 agent brain files (soul/agents/memory/session)
```

---

## 9. Extending — add a new chat artifact

1. **Server route**: model → strict-JSON (copy `routes/email.ts` or `routes/tasks.ts`).
2. **Client lib** in `src/lib/<kind>/client.ts`: the fetch + `encode/parse<Kind>Marker`.
3. **Artifact component** in `src/components/workspace/`.
4. **Provider method** on `ChatSessionProvider` that persists an assistant message with the marker.
5. **Render** it in `chat-message.tsx`; add the kind to `stripNexusMarkers`.
6. **Trigger**: a composer button and/or an intent route in `send()`; extend the queued `pending`
   dispatch for the no-session case.

That's the whole pattern — every artifact (email, tasks, clarify) is built this way.
