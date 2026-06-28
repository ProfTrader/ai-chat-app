# Nexus CRM — Handoff

An AI-native team workspace where **chat is the hub**: from a conversation, the agent (Dexter)
asks interactive questions, then spins up tasks, board flows, briefs, and emails — all grounded in
your firm's profile, with notifications surfaced in an Inbox.

This file is everything a second machine (or a fresh clone) needs to get running.

---

## 1. Prerequisites

- **Node.js 20+** and npm
- A **Moonshot (Kimi) API key** from <https://platform.moonshot.ai> (global) — the app's default LLM
- (Optional) **Ollama** running locally if you want a local fallback model
- (Optional) **Rust + Tauri** toolchain only if you build the desktop app

> The repo uses **two processes**: a Vite web app (port **1420**) and a Hono API server (port **3001**).

---

## 2. First-time setup on a new machine

```bash
git clone https://github.com/ProfTrader/ai-chat-app.git
cd ai-chat-app
npm install
```

### Create the env files (these are gitignored — they hold secrets)

Copy the templates and fill in your Moonshot key:

```bash
cp .env.example .env
cp server/.env.example server/.env
```

Then edit **both** `.env` and `server/.env` and set:

```ini
MOONSHOT_API_KEY=sk-...your key...
MOONSHOT_MODEL=kimi-k2.7
# Leave OLLAMA_MODEL empty so Moonshot is the active provider.
PORT=3001
```

Notes:
- Load order: root `.env` is loaded first and **wins** over `server/.env` (so the root one is authoritative).
- **Model:** `kimi-k2.7` is the current default. The server aliases it to the canonical
  `kimi-k2.7-code` variant (`server/lib/auth.ts` → `MOONSHOT_MODEL_ALIASES`), which is what actually
  hits the API. `/api/auth/status` will report `kimi-k2.7-code`.
- `MOONSHOT_BASE_URL` defaults to `https://api.moonshot.ai/v1`. If your key is from the **China**
  platform, set `MOONSHOT_BASE_URL=https://api.moonshot.cn/v1`.
- **kimi-k2 quirks** (already handled in code): the k2 series requires `temperature: 1` and a large
  `max_completion_tokens` (8192) or answers come back truncated/empty. It's a reasoning model, so
  expect ~10–40s before the answer streams.
- The provider selector keys off `OLLAMA_MODEL`: if it's set (non-empty), Ollama takes priority over
  Moonshot. Keep it empty to use Kimi. (If you see `Not found the model hermes-...`, an old
  `OLLAMA_MODEL` is set — clear it in both env files.)

---

## 3. Run it

```bash
npm run dev:all        # runs web (1420) + API (3001) together
```

or in two terminals:

```bash
npm run dev:web        # Vite web app  -> http://localhost:1420
npm run dev:server     # Hono API      -> http://localhost:3001
```

Open **http://localhost:1420**.

Other scripts: `npm run build` (tsc + vite build), `npm run preview`, `npm run tauri`.

---

## 4. What you'll see on first run

1. **Onboarding wizard** (full-screen): business → domain → socials → AI **researches** your firm →
   review → "Enter workspace". This saves the firm profile to `.data/firm-profile.json` **and**
   `.data/firm-profile.html` (gitignored) and names your workspace.
2. A clean workspace with **predefined team projects**: Risk / Marketing / Operations / Sales / Product.
3. **Chat is the hub.** Try: "Draft a project brief for our launch" → the agent asks
   **interactive multiple-choice questions** → you tap answers → it proposes a **task flow** you can
   add to the board (assigning the team) → it then writes a **premise `.md` document to the canvas**
   and asks **how you want it delivered** (Socratic confirm). Notifications land in the **Inbox**.

To re-run onboarding later: account menu (bottom-left) → **Firm memory → Update business profile**.
To view the saved firm doc: account menu → **Open firm profile**.

---

## 4b. Agent brain files (the agent's soul + memory)

Open **Settings → Agent brain files** to view/edit five markdown files the agent reads on **every
turn** and updates on important changes. They live as real files in **`.data/agent/`** (gitignored,
seeded on first run) and are injected into the system prompt by `agentFilesPromptBlock()`:

| File | Role |
| --- | --- |
| `soul-of-agent.md` | Dexter's identity, values, voice, boundaries (was hardcoded — now editable) |
| `soul-of-firm.md` | The firm's identity/mission/voice. Auto-refreshed from onboarding unless you've hand-edited it |
| `agents.md` | Operating manual: the clarify→premise→deliver workflow, skills, house rules |
| `memory.md` | Durable facts + preferences. The agent **appends** on "remember/prefer/always…" and on delivery choices |
| `session.md` | Running session log — appended after each premise is delivered |

Design follows the Hermes-agent pattern: identity (soul) is kept separate from learned facts (memory)
from procedure (agents.md). Edit any file to steer the agent; the "agent" badge marks files the agent
last touched.

**API:** `GET/PUT /api/agent-files`, `GET /api/agent-files/:name`, `POST /api/agent-files/:name/append`.

### The Socratic delivery flow

After the clarify answers + task proposal, the agent delivers a **premise document** to the canvas
(a new `[[nexus:doc:…]]` artifact rendered by `doc-artifact.tsx`, with "Open in canvas" + Download
`.md`), then shows a **delivery-choice card** (`delivery-choice.tsx`): tasks to board / full brief /
keep the doc / revise first. The choice is **remembered** to `memory.md` + pinned memory, then
executed. Markers: `[[nexus:doc:…]]` and `[[nexus:deliver:…]]` (see `src/lib/docs/client.ts`).

---

## 5. Where state lives (important for "another computer")

| Data | Location | Synced via git? |
| --- | --- | --- |
| App data (projects, chats, tasks, notifications) | Browser **IndexedDB** (`nexus-browser-db`) + `localStorage` fallback | ❌ per-browser |
| Onboarding "completed" flag + answers | `localStorage` (`crm-onboarding`) | ❌ per-browser |
| **Firm profile** ("soul of the firm") | `.data/firm-profile.json` + `.html` (server) | ❌ gitignored |
| **Agent brain files** (soul/agents/memory/session) | `.data/agent/*.md` + `.meta.json` (server) | ❌ gitignored |
| Secrets (API key) | `.env`, `server/.env` | ❌ gitignored |
| Code | the repo | ✅ |

⇒ On a new machine you re-run **onboarding** (re-creates the firm profile) and re-enter your **key**.
The agent brain files re-seed automatically on first run. Chat history is per-browser and does
**not** transfer.

---

## 6. Current status

**Done & verified**
- ElevenLabs-style dark UI; Moonshot (**kimi-k2.7** → `kimi-k2.7-code`) chat working end-to-end.
- Onboarding + firm research; firm profile persisted (JSON+HTML) and injected into every chat as
  "FIRM MEMORY" (the agent personalizes to the firm).
- Chat artifacts: **file attachments** (drag/drop), **email drafts**, **task proposals → board**,
  and **interactive multiple-choice questions** (the intake card).
- Predefined **team projects**; per-project + per-chat **archive** buttons.
- Mock/seed CRM data removed; "create a plan" asks grounded questions instead of canned output.
- Reasoning/typing **shimmer** indicators; aligned streaming avatar.
- **Sidebar polish**: row labels fade at the right border (`.fade-text-r`) and the `+`/archive
  controls stay pinned in-bounds when the sidebar is resized narrow (`nav-sidebar.tsx`).
- **Faster perceived chat**: in the clarify/task/brief flows the user's message renders **immediately**
  and a **descriptive shimmer** ("Preparing a few quick questions…", "Breaking this into tasks…")
  runs while the request is in flight, instead of a blank pause.

**Built + compiles (esbuild-clean); needs a local click-through verification**
> These were finished while the dev environment was too throttled to drive a browser, so they're
> verified to compile + (server side) run, but not yet click-tested live. Please confirm on your machine.
- **Agent brain files** (§4b): 5 editable `.md` files in `.data/agent/`, surfaced in **Settings →
  Agent brain files**, injected into the prompt, and self-updated (memory/session). Server lib
  runtime-tested (files seed; 4.5 KB prompt block). Confirm the Settings panel renders + edits save.
- **Socratic premise-doc delivery** (§4b): post-tasks premise `.md` on the canvas + delivery-choice
  card + preference capture. Confirm the doc artifact + "Open in canvas" + delivery card appear.
- **Phase 2 flow**: interactive answers → task-proposal → **Add to board** → team-assigned tasks +
  **brief linked to first task** + **Inbox notifications**. Endpoints + UI in place.

**Known follow-ups / ideas**
- Render the premise on the **real briefs canvas** (currently a focused Dialog "canvas"), and let
  "full HTML brief" reuse the existing brief artifact pipeline.
- True **web research** in onboarding (currently the model analyzes provided info; no live crawl).
- Image **vision** (attachments preview but aren't sent to the non-vision model).
- Optionally restore the firm name onto the project after onboarding (workspace already renames).

**Dev/perf notes**
- First `npm run dev:all` does a **one-time Vite dependency optimization** (a few seconds on normal
  hardware), then loads are instant. Don't `rm -rf node_modules/.vite` unless necessary — it forces a
  full cold re-optimization. `optimizeDeps.entries: ["index.html"]` (`vite.config.ts`) scopes the scan.
- The dev server binds **127.0.0.1** (`vite.config.ts`); the `/api` proxy targets `http://127.0.0.1:3001`.

---

## 7. Useful commands

```bash
npm run build                 # typecheck + production build
npx tsc --noEmit              # typecheck only
curl localhost:3001/api/health           # API health
curl localhost:3001/api/auth/status      # which model/provider is active
```

See **ARCHITECTURE.md** for how the whole thing fits together.
