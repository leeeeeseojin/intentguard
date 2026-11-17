import { serve } from "@hono/node-server";
import { MiniCloud } from "../domain/store.js";
import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 8787);
const transitionDelayMs = Number(process.env.TRANSITION_DELAY_MS ?? 1500);

const app = createApp(new MiniCloud({ transitionDelayMs }));

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`MiniCloud API listening on http://localhost:${info.port}/api`);
});
