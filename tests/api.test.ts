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
    const res = await app.request("/api/instances/srv-0001", { method: "DELETE" });
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(json.error).toMatchObject({ code: "INVALID_STATE", hint: expect.any(String) });
  });

  it("x-actor 헤더를 감사 로그에 기록하고 reset하면 비운다", async () => {
    await post("/api/instances/srv-0008/stop");
    let audit = await (await app.request("/api/_audit")).json();
    expect(audit.items[0]).toMatchObject({ actor: "agent", action: "instance.stop" });

    await post("/api/_reset");
    audit = await (await app.request("/api/_audit")).json();
    expect(audit.items).toHaveLength(0);
  });

  it("없는 경로는 JSON 404", async () => {
    const res = await app.request("/api/nope");
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("NOT_FOUND");
  });
});
