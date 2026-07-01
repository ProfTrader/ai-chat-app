import { Hono } from "hono";
import { z } from "zod";

const gateway = new Hono();

const gatewayMessageSchema = z.object({
  projectId: z.string().min(1),
  channel: z.enum(["nexus_chat", "webhook", "slack", "github", "email"]).default("webhook"),
  externalThreadId: z.string().optional(),
  externalId: z.string().optional(),
  externalUrl: z.string().url().optional(),
  eventType: z.string().optional(),
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  sender: z.string().default("External source"),
  text: z.string().min(1),
});

gateway.post("/messages", async (c) => {
  const body = gatewayMessageSchema.parse(await c.req.json());
  const now = new Date().toISOString();
  const message = {
    id: `gateway-${crypto.randomUUID().slice(0, 8)}`,
    projectId: body.projectId,
    channel: body.channel,
    externalThreadId: body.externalThreadId,
    externalId: body.externalId,
    externalUrl: body.externalUrl,
    eventType: body.eventType,
    metadata: body.metadata,
    sender: body.sender,
    text: body.text,
    status: "routed",
    createdAt: now,
  };
  const run = {
    id: `brain-run-${crypto.randomUUID().slice(0, 8)}`,
    projectId: body.projectId,
    gatewayMessageId: message.id,
    title: `${body.channel.replace(/_/g, " ")} gateway run`,
    request: body.text,
    intent: "gateway_notification",
    status: "running",
    trustLevel: 0,
    currentStage: "retrieve_context",
    contextPackId: `ctx-${crypto.randomUUID().slice(0, 8)}`,
    outputKind: "gateway_notification",
    createdAt: now,
    updatedAt: now,
  };

  return c.json({
    message: { ...message, runId: run.id },
    run,
    events: [
      {
        id: `event-${crypto.randomUUID().slice(0, 8)}`,
        runId: run.id,
        stage: "ingest",
        title: "Gateway message received",
        detail: `Received ${body.channel.replace(/_/g, " ")} message from ${body.sender}.`,
        status: "completed",
        createdAt: now,
      },
      {
        id: `event-${crypto.randomUUID().slice(0, 8)}`,
        runId: run.id,
        stage: "retrieve_context",
        title: "Project brain selected",
        detail: "The message is ready to route into the project context engine.",
        status: "running",
        createdAt: now,
      },
    ],
  });
});

export { gateway };
