import { Hono, type Context } from "hono";
import { z } from "zod";
import { CloudError } from "../domain/errors.js";
import type { MiniCloud } from "../domain/store.js";
import type { Actor } from "../domain/types.js";

const envSchema = z.enum(["dev", "staging", "prod"]);
const specSchema = z.enum(["micro", "small", "medium", "large"]);

const createInstanceSchema = z.object({
  name: z.string(),
  env: envSchema,
  spec: specSchema,
  zone: z.string().optional(),
  securityGroupId: z.string().optional(),
  assignPublicIp: z.boolean().optional(),
});

const addRuleSchema = z.object({
  protocol: z.enum(["tcp", "udp"]),
  port: z.number().int(),
  source: z.string(),
  description: z.string().optional(),
});

const bucketPublicSchema = z.object({ public: z.boolean() });

function actorOf(c: Context): Actor {
  const value = c.req.header("x-actor");
  return value === "human" || value === "agent" ? value : "unknown";
}

async function body<T>(c: Context, schema: z.ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new CloudError("INVALID_ARGUMENT", "요청 본문이 올바른 JSON이 아닙니다.");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join(".") || "(body)"}: ${i.message}`).join("; ");
    throw new CloudError("INVALID_ARGUMENT", `요청 값이 올바르지 않습니다. ${detail}`);
  }
  return parsed.data;
}

export function createApp(cloud: MiniCloud) {
  const app = new Hono().basePath("/api");

  app.onError((err, c) => {
    if (err instanceof CloudError) {
      return c.json({ error: err.toJSON() }, err.status as 400);
    }
    console.error(err);
    return c.json({ error: { code: "INTERNAL", message: "서버 내부 오류" } }, 500);
  });

  app.notFound((c) => c.json({ error: { code: "NOT_FOUND", message: `경로를 찾을 수 없습니다: ${c.req.path}` } }, 404));

  // 서버
  app.get("/instances", (c) =>
    c.json({ items: cloud.listInstances({ env: c.req.query("env"), status: c.req.query("status"), q: c.req.query("q") }) }),
  );
  app.get("/instances/:id", (c) => c.json(cloud.getInstance(c.req.param("id"))));
  app.post("/instances", async (c) => c.json(cloud.createInstance(await body(c, createInstanceSchema), actorOf(c)), 201));
  app.post("/instances/:id/stop", (c) => c.json(cloud.stopInstance(c.req.param("id"), actorOf(c))));
  app.post("/instances/:id/start", (c) => c.json(cloud.startInstance(c.req.param("id"), actorOf(c))));
  app.delete("/instances/:id", (c) => c.json(cloud.deleteInstance(c.req.param("id"), actorOf(c))));

  // 보안 그룹
  app.get("/security-groups", (c) => c.json({ items: cloud.listSecurityGroups() }));
  app.get("/security-groups/:id", (c) => c.json(cloud.getSecurityGroup(c.req.param("id"))));
  app.post("/security-groups/:id/rules", async (c) =>
    c.json(cloud.addSecurityRule(c.req.param("id"), await body(c, addRuleSchema), actorOf(c)), 201),
  );
  app.delete("/security-groups/:id/rules/:ruleId", (c) =>
    c.json(cloud.removeSecurityRule(c.req.param("id"), c.req.param("ruleId"), actorOf(c))),
  );

  // 버킷
  app.get("/buckets", (c) => c.json({ items: cloud.listBuckets() }));
  app.post("/buckets/:id/public", async (c) =>
    c.json(cloud.setBucketPublic(c.req.param("id"), (await body(c, bucketPublicSchema)).public, actorOf(c))),
  );
  app.post("/buckets/:id/empty", (c) => c.json(cloud.emptyBucket(c.req.param("id"), actorOf(c))));
  app.delete("/buckets/:id", (c) => c.json(cloud.deleteBucket(c.req.param("id"), actorOf(c))));

  // 실험용
  app.get("/_audit", (c) => c.json({ items: cloud.getAudit() }));
  app.post("/_reset", (c) => {
    cloud.reset();
    return c.json({ ok: true });
  });

  return app;
}
