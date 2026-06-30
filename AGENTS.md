# AGENTS.md — running Nexus CRM locally

Read this first if you're an agent (or human) starting work on this repo. It captures
the setup plus the **non-obvious gotchas that will eat your time** if you don't know them.
Pair with `ARCHITECTURE.md` (how it's built) and `HANDOFF.md` (feature history).

---

## 1. Quick start

```bash
npm install
cp .env.example .env            # if .env is missing
cp server/.env.example server/.env
npm run dev:all                 # web (Vite :1420) + API (Hono :3001)
```

- Web app: http://127.0.0.1:1420
- API: http://127.0.0.1:3001 (health: `GET /api/health`)
- Required env (in `.env`, which wins over `server/.env`):
  ```ini
  MOONSHOT_API_KEY=sk-...
  MOONSHOT_MODEL=kimi-k2.7-code
  PORT=3001
  ```
- Leave `OLLAMA_MODEL` empty unless you intentionally want the Ollama fallback.

---

## 2. The two processes

| Process | Command | Port | Reloads on file change? |
| --- | --- | --- | --- |
| Web (Vite) | `npm run dev:web` | 1420 | yes (HMR) |
| API (Hono) | `npm run dev:server` | 3001 | yes — now runs `tsx watch` |

`npm run dev:all` runs both together via `concurrently`.

---

## 3. ⚠️ CRITICAL GOTCHAS (these caused real, hard-to-diagnose failures)

### 3.1 Do NOT run `npm run build` while the dev server is running
`npm run build` runs `vite build`, which **shares and clobbers the `node_modules/.vite`
dep-optimization cache** with the running dev server. The result is a dev server that
serves a **broken/duplicate React runtime** → the app mounts to an **empty root, black
screen, and NO console error**. It looks like a render crash but isn't.

**If you see a black screen with an empty `#root` and no error:**
```bash
# kill all vite, clear the cache, restart clean
pkill -f "node.*\.bin/vite"; lsof -ti :1420 | xargs kill -9 2>/dev/null
rm -rf node_modules/.vite
npm run dev:web        # or npm run dev:all
```
To build for production, **stop the dev server first**, or build in a separate checkout.

### 3.2 Vite is slow to (re)optimize deps on this project (~80–120s)
After any Vite restart or `rm -rf node_modules/.vite`, the **first page load hangs**
until dep optimization finishes (look for `VITE ... ready in NNNNN ms` in the log).
This is normal here (recharts + a large baked dataset). Wait for it; don't assume it's hung.
A quick readiness check:
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:1420/node_modules/.vite/deps/react.js
# 200 = deps ready
```

### 3.3 After editing a **server route**, confirm it reloaded
`dev:server` now uses `tsx watch`, so it should hot-reload. If a route still 404s or
serves old behaviour (the classic symptom: `/api/<x>` returns 404 right after you add it),
the API process is stale — restart it:
```bash
kill $(lsof -ti :3001); npm run dev:server
```

### 3.4 Installing a new dependency mid-session
If you `npm install <pkg>` while Vite is running, the first page that imports it may throw
"Failed to resolve import / Outdated Optimize Dep" until you **hard-reload the browser**
(`Cmd+Shift+R`). Reload fixes it.

### 3.5 Stale client auth state
If the UI says "Configure a chat provider" while `GET /api/auth/status` reports
`connected: true`, just **reload the browser tab**.

---

## 4. Verifying a change

```bash
npm run build      # tsc + vite build — DO THIS IN A STOPPED-DEV CHECKOUT (see 3.1)
```
- `tsc` can be slow (a large baked data literal). Be patient; exit 0 = types pass.
- For runtime checks, drive the real app in the browser rather than only trusting the build.

Quick API smoke tests:
```bash
curl http://127.0.0.1:3001/api/health
curl http://127.0.0.1:3001/api/auth/status
```

---

## 5. Data & the executive insight feature

- The app is **local-first**: state lives in the browser's **IndexedDB** (`nexus-browser-db`,
  key `crm-data`) with a `localStorage` backup. Server state is flat files in `.data/`.
  Desktop (Tauri) uses **SQLite** (`crm.db`). There is **no external SQL database**.
- Analytical datasets (`ProjectDataset`) live in that IndexedDB store. The exec **insight**
  artifact reads them; if a project has no finance-shaped dataset, `ensureInsightDataset()`
  seeds a **real** one: `src/lib/insight/supermarket-data.ts` (Kaggle "Supermarket sales",
  1,000 rows, baked in). It shows up under the project's **Files** panel.
- Insight numbers (KPIs, charts) are computed **deterministically from real data**
  (`src/lib/insight/compute.ts`). The **verdict** (status + headline + drivers) is generated
  by the LLM via `POST /api/insight`, grounded in those numbers. JSON mode + one retry make
  it reliable; on failure the client keeps the grounded deterministic verdict (with drivers),
  never a bare template.

---

## 6. Useful commands

```bash
npm run dev:all        # web + api
npm run dev:web        # vite only
npm run dev:server     # api only (tsx watch)
npm run build          # production build — stop dev first (see 3.1)
curl http://127.0.0.1:3001/api/health
lsof -ti :1420         # find the vite pid
lsof -ti :3001         # find the api pid
```

---

## 7. House rules

- Don't commit `.env`, `server/.env`, `.data/`, or local scratch (`.playwright-cli/`, etc.).
- Branch before committing if you're on `main`. The active feature branch is `sync/nexus-build`.
- When adding a chat artifact, follow the marker pattern in `ARCHITECTURE.md §9`
  (`[[nexus:<kind>:<payload-or-id>]]`, rendered in `chat-message.tsx`).
