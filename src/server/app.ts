import { Hono, type Context } from "hono";
import { z } from "zod";
import { CloudError } from "../domain/errors.js";
import type { MiniCloud } from "../domain/store.js";
import type { Actor } from "../domain/types.js";
import { IntentGuard, type ApprovalStatus } from "../guard/guard.js";
import type { Operation } from "../guard/operations.js";

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
const rejectSchema = z.object({ reason: z.string().optional() });
const agentControlSchema = z.object({ paused: z.boolean() });

// 주의: 자기 신고 값이다. 실제 권한 경계로 쓰려면 인증이 필요하다(README "신뢰 경계").
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

export function createApp(cloud: MiniCloud, guard: IntentGuard = new IntentGuard(cloud)) {
  const app = new Hono().basePath("/api");

  app.onError((err, c) => {
    if (err instanceof CloudError) {
      return c.json({ error: err.toJSON() }, err.status as 400);
    }
    console.error(err);
    return c.json({ error: { code: "INTERNAL", message: "서버 내부 오류" } }, 500);
  });

  app.notFound((c) => c.json({ error: { code: "NOT_FOUND", message: `경로를 찾을 수 없습니다: ${c.req.path}` } }, 404));

  /** 상태를 바꾸는 요청은 모두 IntentGuard를 거친다. 승인이 필요하면 202로 대기 상태를 돌려준다. */
  const mutate = (c: Context, op: Operation, okStatus: 200 | 201 = 200) => {
    const reasonHeader = c.req.header("x-agent-reason");
    const reason = reasonHeader ? decodeURIComponent(reasonHeader) : undefined;
    const result = guard.run(op, actorOf(c), reason);
    const pending = (result as { status?: string })?.status === "pending_approval";
    return c.json(result as object, pending ? 202 : okStatus);
  };

  // 서버
  app.get("/instances", (c) =>
    c.json({ items: cloud.listInstances({ env: c.req.query("env"), status: c.req.query("status"), q: c.req.query("q") }) }),
  );
  app.get("/instances/:id", (c) => c.json(cloud.getInstance(c.req.param("id"))));
  app.post("/instances", async (c) => mutate(c, { kind: "instance.create", input: await body(c, createInstanceSchema) }, 201));
  app.post("/instances/:id/stop", (c) => mutate(c, { kind: "instance.stop", id: c.req.param("id") }));
  app.post("/instances/:id/start", (c) => mutate(c, { kind: "instance.start", id: c.req.param("id") }));
  app.delete("/instances/:id", (c) => mutate(c, { kind: "instance.delete", id: c.req.param("id") }));

  // 보안 그룹
  app.get("/security-groups", (c) => c.json({ items: cloud.listSecurityGroups() }));
  app.get("/security-groups/:id", (c) => c.json(cloud.getSecurityGroup(c.req.param("id"))));
  app.post("/security-groups/:id/rules", async (c) =>
    mutate(c, { kind: "securityGroup.addRule", sgId: c.req.param("id"), input: await body(c, addRuleSchema) }, 201),
  );
  app.delete("/security-groups/:id/rules/:ruleId", (c) =>
    mutate(c, { kind: "securityGroup.removeRule", sgId: c.req.param("id"), ruleId: c.req.param("ruleId") }),
  );

  // 버킷
  app.get("/buckets", (c) => c.json({ items: cloud.listBuckets() }));
  app.post("/buckets/:id/public", async (c) =>
    mutate(c, { kind: "bucket.setPublic", id: c.req.param("id"), public: (await body(c, bucketPublicSchema)).public }),
  );
  app.post("/buckets/:id/empty", (c) => mutate(c, { kind: "bucket.empty", id: c.req.param("id") }));
  app.delete("/buckets/:id", (c) => mutate(c, { kind: "bucket.delete", id: c.req.param("id") }));

  // IntentGuard: 승인 대기열과 에이전트 제어
  app.get("/approvals", (c) => c.json({ items: guard.list(c.req.query("status") as ApprovalStatus | undefined) }));
  app.get("/approvals/:id", (c) => c.json(guard.get(c.req.param("id"))));
  app.post("/approvals/:id/approve", (c) => c.json(guard.approve(c.req.param("id"), actorOf(c))));
  app.post("/approvals/:id/reject", async (c) => {
    const { reason } = await body(c, rejectSchema);
    return c.json(guard.reject(c.req.param("id"), actorOf(c), reason));
  });
  app.get("/agent-control", (c) => c.json({ paused: guard.isPaused }));
  app.post("/agent-control", async (c) => {
    guard.setPaused((await body(c, agentControlSchema)).paused, actorOf(c));
    return c.json({ paused: guard.isPaused });
  });
  app.get("/activity", (c) => c.json({ items: cloud.getAudit() }));

  // 실험용
  app.get("/_audit", (c) => c.json({ items: cloud.getAudit() }));
  app.post("/_reset", (c) => {
    // 초기화는 승인 대기열과 일시정지를 지우므로 사람만 할 수 있다.
    if (actorOf(c) !== "human") throw new CloudError("FORBIDDEN", "사람만 실험 상태를 초기화할 수 있습니다.");
    cloud.reset();
    guard.reset();
    return c.json({ ok: true });
  });

  return app;
}
