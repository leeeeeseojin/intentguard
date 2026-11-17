import { serve } from "@hono/node-server";
import { MiniCloud } from "../domain/store.js";
import { IntentGuard } from "../guard/guard.js";
import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 8787);
const transitionDelayMs = Number(process.env.TRANSITION_DELAY_MS ?? 1500);
const approvalPolicy = process.env.APPROVAL_POLICY !== "off";

const cloud = new MiniCloud({ transitionDelayMs });
const app = createApp(cloud, new IntentGuard(cloud, { enabled: approvalPolicy }));

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`MiniCloud API listening on http://localhost:${info.port}/api (IntentGuard approvals: ${approvalPolicy ? "on" : "off"})`);
});
