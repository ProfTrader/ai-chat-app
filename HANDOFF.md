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
MOONSHOT_MODEL=kimi-k2.6
# Leave OLLAMA_MODEL commented out so Moonshot is the active provider.
PORT=3001
```

Notes:
- Load order: root `.env` is loaded first and **wins** over `server/.env` (so the root one is authoritative).
- `MOONSHOT_BASE_URL` defaults to `https://api.moonshot.ai/v1`. If your key is from the **China**
  platform, set `MOONSHOT_BASE_URL=https://api.moonshot.cn/v1`.
- **kimi-k2.6 quirks** (already handled in code): it requires `temperature: 1` and a large
  `max_completion_tokens` (8192) or answers come back truncated/empty. It's a reasoning model, so
  expect ~10–40s before the answer streams.
- If you ever see `Not found the model hermes-... or Permission denied`, an old `OLLAMA_MODEL` is set
  and taking priority — comment it out in both env files.

---

## 3. Run it

```bash
npm run dev:all        # runs web (1420) + API (3001) together
```

or in two terminals:

```bash
npm run dev            # Vite web app  -> http://localhost:1420
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
   add to the board (assigning the team), with **notifications** landing in the **Inbox**.

To re-run onboarding later: account menu (bottom-left) → **Firm memory → Update business profile**.
To view the saved firm doc: account menu → **Open firm profile**.

---

## 5. Where state lives (important for "another computer")

| Data | Location | Synced via git? |
| --- | --- | --- |
| App data (projects, chats, tasks, notifications) | Browser **IndexedDB** (`nexus-browser-db`) + `localStorage` fallback | ❌ per-browser |
| Onboarding "completed" flag + answers | `localStorage` (`crm-onboarding`) | ❌ per-browser |
| **Firm profile** ("soul of the firm") | `.data/firm-profile.json` + `.html` (server) | ❌ gitignored |
| Secrets (API key) | `.env`, `server/.env` | ❌ gitignored |
| Code | the repo | ✅ |

⇒ On a new machine you re-run **onboarding** (re-creates the firm profile) and re-enter your **key**.
Chat history is per-browser and does **not** transfer.

---

## 6. Current status

**Done & verified**
- ElevenLabs-style dark UI; Moonshot (kimi-k2.6) chat working end-to-end.
- Onboarding + firm research; firm profile persisted (JSON+HTML) and injected into every chat as
  "FIRM MEMORY" (the agent personalizes to the firm).
- Chat artifacts: **file attachments** (drag/drop), **email drafts**, **task proposals → board**,
  and **interactive multiple-choice questions** (the intake card).
- Predefined **team projects**; per-project + per-chat **archive** buttons.
- Mock/seed CRM data removed; "create a plan" asks grounded questions instead of canned output.
- Reasoning/typing **shimmer** indicators; aligned streaming avatar.
- **Non-destructive** schema migration (preserves existing chats, adds the team template).

**Built, typechecks, needs a final click-through verification**
- **Phase 2 flow**: after the interactive answers → task-proposal flow → **Add to board** creates
  team-assigned tasks, drops a **brief linked to the first task**, and routes **notifications to the
  Inbox** (notification center + unread badge). Endpoints + UI are in place; the full
  plan→answer→board→inbox chain hasn't had a final screenshot pass yet.

**Known follow-ups / ideas**
- Re-introduce **briefs as a model-driven HTML artifact** (the old canned brief flow is disabled).
- True **web research** in onboarding (currently the model analyzes provided info; no live crawl).
- Image **vision** (attachments preview but aren't sent to the non-vision model).
- Optionally restore the firm name onto the project after onboarding (workspace already renames).

---

## 7. Useful commands

```bash
npm run build                 # typecheck + production build
npx tsc --noEmit              # typecheck only
curl localhost:3001/api/health           # API health
curl localhost:3001/api/auth/status      # which model/provider is active
```

See **ARCHITECTURE.md** for how the whole thing fits together.
