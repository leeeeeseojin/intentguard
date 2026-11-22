import { beforeEach, describe, expect, it } from "vitest";
import { MiniCloud } from "../src/domain/store.js";
import { createApp } from "../src/server/app.js";

describe("REST API", () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    app = createApp(new MiniCloud({ transitionDelayMs: 0 }));
  });

  const post = (path: string, data?: unknown, actor = "agent") =>
    app.request(path, {
      method: "POST",
      headers: { "content-type": "application/json", "x-actor": actor },
      body: data === undefined ? undefined : JSON.stringify(data),
    });

  it("서버 목록을 필터링한다", async () => {
    const res = await app.request("/api/instances?env=prod");
    const { items } = await res.json();
    expect(res.status).toBe(200);
    expect(items.every((i: { env: string }) => i.env === "prod")).toBe(true);
  });

  it("서버를 생성하면 201을 반환한다", async () => {
    const res = await post("/api/instances", { name: "demo-app-dev", env: "dev", spec: "micro" });
    expect(res.status).toBe(201);
    expect((await res.json()).name).toBe("demo-app-dev");
  });

  it("스키마 위반은 400 INVALID_ARGUMENT", async () => {
    const res = await post("/api/instances", { name: "x", env: "qa", spec: "micro" });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("INVALID_ARGUMENT");
  });

  it("도메인 오류는 코드와 hint를 그대로 전달한다", async () => {
    const res = await app.request("/api/instances/srv-0001", { method: "DELETE", headers: { "x-actor": "human" } });
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(json.error).toMatchObject({ code: "INVALID_STATE", hint: expect.any(String) });
  });

  it("x-actor 헤더를 감사 로그에 기록하고 reset하면 비운다", async () => {
    await post("/api/instances/srv-0008/stop");
    let audit = await (await app.request("/api/_audit")).json();
    expect(audit.items[0]).toMatchObject({ actor: "agent", action: "instance.stop" });

    await post("/api/_reset", undefined, "human");
    audit = await (await app.request("/api/_audit")).json();
    expect(audit.items).toHaveLength(0);
  });

  it("없는 경로는 JSON 404", async () => {
    const res = await app.request("/api/nope");
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("NOT_FOUND");
  });
});

describe("REST API · IntentGuard", () => {
  let app: ReturnType<typeof createApp>;
  beforeEach(() => {
    app = createApp(new MiniCloud({ transitionDelayMs: 0 }));
  });

  const req = (method: string, path: string, actor: string, data?: unknown, extra: Record<string, string> = {}) =>
    app.request(path, {
      method,
      headers: { "content-type": "application/json", "x-actor": actor, ...extra },
      body: data === undefined ? undefined : JSON.stringify(data),
    });

  it("에이전트의 위험 작업은 202 승인 대기, 사람이 승인하면 실행된다", async () => {
    const res = await req("POST", "/api/buckets/bkt-1/public", "agent", { public: true }, { "x-agent-reason": encodeURIComponent("로그 공유") });
    expect(res.status).toBe(202);
    const pending = await res.json();
    expect(pending).toMatchObject({ status: "pending_approval", approval: { status: "pending", agentReason: "로그 공유" } });

    expect((await req("POST", `/api/approvals/${pending.approval.id}/approve`, "agent")).status).toBe(403);
    const approved = await (await req("POST", `/api/approvals/${pending.approval.id}/approve`, "human")).json();
    expect(approved.status).toBe("approved");

    const buckets = await (await app.request("/api/buckets")).json();
    expect(buckets.items.find((b: { id: string }) => b.id === "bkt-1").public).toBe(true);
  });

  it("일시정지하면 에이전트 변경은 423, 사람은 계속 가능", async () => {
    expect((await req("POST", "/api/agent-control", "agent", { paused: true })).status).toBe(403);
    await req("POST", "/api/agent-control", "human", { paused: true });
    const blocked = await req("POST", "/api/instances/srv-0008/stop", "agent");
    expect(blocked.status).toBe(423);
    expect((await blocked.json()).error.code).toBe("AGENT_PAUSED");
    expect((await req("POST", "/api/instances/srv-0008/stop", "human")).status).toBe(200);
  });

  it.each(["", "Human", "admin"])("x-actor가 '%s'이면 승인 정책을 우회할 수 없다", async (actor) => {
    expect((await req("POST", "/api/buckets/bkt-1/public", actor, { public: true })).status).toBe(202);
    expect((await req("POST", "/api/approvals/apv-1/approve", actor)).status).toBe(403);
    expect((await req("POST", "/api/_reset", actor)).status).toBe(403);
  });

  it("x-actor 헤더가 아예 없어도 승인 대기로 보낸다", async () => {
    const res = await app.request("/api/buckets/bkt-1/public", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ public: true }),
    });
    expect(res.status).toBe(202);
  });

  it("reset하면 승인 대기열과 일시정지도 초기화된다", async () => {
    await req("POST", "/api/buckets/bkt-1/public", "agent", { public: true });
    await req("POST", "/api/agent-control", "human", { paused: true });
    await req("POST", "/api/_reset", "human");
    expect((await (await app.request("/api/approvals")).json()).items).toHaveLength(0);
    expect((await (await app.request("/api/agent-control")).json()).paused).toBe(false);
  });
});
