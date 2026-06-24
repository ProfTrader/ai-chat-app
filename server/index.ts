import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { auth } from "./routes/auth.js";
import { chat } from "./routes/chat.js";

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
app.route("/api/chat", chat);

const port = Number(process.env.PORT ?? 3001);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Nexus CRM API listening on http://localhost:${info.port}`);
});
