import { config } from "dotenv";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { auth } from "./routes/auth.js";
import { agent } from "./routes/agent.js";
import { agentFiles } from "./routes/agent-files.js";
import { chat } from "./routes/chat.js";
import { gateway } from "./routes/gateway.js";
import { onboarding } from "./routes/onboarding.js";
import { email } from "./routes/email.js";
import { tasks } from "./routes/tasks.js";
import { clarify } from "./routes/clarify.js";
import { plan } from "./routes/plan.js";

config();
config({ path: "server/.env", override: false });

const app = new Hono();

app.use(
  "*",
  cors({
    origin: ["http://localhost:1420", "http://127.0.0.1:1420", "tauri://localhost"],
    credentials: true,
  }),
);

app.get("/api/health", (c) => c.json({ ok: true }));

app.route("/api/auth", auth);
app.route("/api/agent-files", agentFiles);
app.route("/api/agent", agent);
app.route("/api/chat", chat);
app.route("/api/gateway", gateway);
app.route("/api/onboarding", onboarding);
app.route("/api/email", email);
app.route("/api/tasks", tasks);
app.route("/api/clarify", clarify);
app.route("/api/plan", plan);

const port = Number(process.env.PORT ?? 3001);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Nexus CRM API listening on http://localhost:${info.port}`);
});
