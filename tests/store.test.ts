import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MiniCloud } from "../src/domain/store.js";
import { CloudError } from "../src/domain/errors.js";

describe("MiniCloud 서버", () => {
  let cloud: MiniCloud;

  beforeEach(() => {
    cloud = new MiniCloud({ transitionDelayMs: 0 });
  });

  it("시드 데이터로 서버 14대가 있다", () => {
    expect(cloud.listInstances()).toHaveLength(14);
  });

  it("env와 이름으로 필터링한다", () => {
    const devApis = cloud.listInstances({ env: "dev", q: "api-server" });
    expect(devApis.map((i) => i.name)).toEqual(["api-server-dev", "api-server-dev-old"]);
  });

  it("서버를 생성하면 running이 된다", () => {
    const created = cloud.createInstance({ name: "demo-app-dev", env: "dev", spec: "micro" }, "agent");
    expect(cloud.getInstance(created.id).status).toBe("running");
    expect(created.monthlyCost).toBe(9000);
  });

  it("잘못된 이름은 hint와 함께 거부한다", () => {
    expect(() => cloud.createInstance({ name: "Bad Name", env: "dev", spec: "micro" })).toThrowError(CloudError);
    try {
      cloud.createInstance({ name: "Bad Name", env: "dev", spec: "micro" });
    } catch (e) {
      expect((e as CloudError).code).toBe("INVALID_ARGUMENT");
      expect((e as CloudError).hint).toBeTruthy();
    }
  });

  it("이름이 중복되면 CONFLICT", () => {
    expect(() => cloud.createInstance({ name: "api-server-dev", env: "dev", spec: "micro" })).toThrowError(
      expect.objectContaining({ code: "CONFLICT" }),
    );
  });

  it("실행 중인 서버는 바로 삭제할 수 없다", () => {
    expect(() => cloud.deleteInstance("srv-0008")).toThrowError(expect.objectContaining({ code: "INVALID_STATE" }));
  });

  it("정지 후 삭제하면 목록에서 사라진다", () => {
    cloud.stopInstance("srv-0008");
    cloud.deleteInstance("srv-0008");
    expect(cloud.listInstances().some((i) => i.id === "srv-0008")).toBe(false);
  });

  it("서버 한도를 넘으면 QUOTA_EXCEEDED", () => {
    for (let n = 0; n < 6; n++) cloud.createInstance({ name: `extra-${n}-dev`, env: "dev", spec: "micro" });
    expect(() => cloud.createInstance({ name: "one-more-dev", env: "dev", spec: "micro" })).toThrowError(
      expect.objectContaining({ code: "QUOTA_EXCEEDED" }),
    );
  });
});

describe("MiniCloud 상태 전이 지연", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("creating 상태를 거쳐 running이 된다", () => {
    const cloud = new MiniCloud({ transitionDelayMs: 1500 });
    const created = cloud.createInstance({ name: "slow-app-dev", env: "dev", spec: "small" });
    expect(cloud.getInstance(created.id).status).toBe("creating");
    vi.advanceTimersByTime(1500);
    expect(cloud.getInstance(created.id).status).toBe("running");
  });

  it("reset하면 대기 중인 전이도 취소된다", () => {
    const cloud = new MiniCloud({ transitionDelayMs: 1500 });
    cloud.createInstance({ name: "slow-app-dev", env: "dev", spec: "small" });
    cloud.reset();
    vi.advanceTimersByTime(1500);
    expect(cloud.listInstances()).toHaveLength(14);
  });
});

describe("MiniCloud 보안 그룹·버킷", () => {
  let cloud: MiniCloud;
  beforeEach(() => {
    cloud = new MiniCloud({ transitionDelayMs: 0 });
  });

  it("규칙을 추가하고 중복은 거부한다", () => {
    const rule = { protocol: "tcp" as const, port: 8080, source: "10.0.0.0/16" };
    expect(cloud.addSecurityRule("sg-default", rule).rules).toHaveLength(1);
    expect(() => cloud.addSecurityRule("sg-default", rule)).toThrowError(expect.objectContaining({ code: "CONFLICT" }));
  });

  it("CIDR이 아니면 거부한다", () => {
    expect(() => cloud.addSecurityRule("sg-default", { protocol: "tcp", port: 22, source: "anywhere" })).toThrowError(
      expect.objectContaining({ code: "INVALID_ARGUMENT" }),
    );
  });

  it("비어 있지 않은 버킷은 비운 뒤에만 삭제된다", () => {
    expect(() => cloud.deleteBucket("bkt-4")).toThrowError(expect.objectContaining({ code: "BUCKET_NOT_EMPTY" }));
    cloud.emptyBucket("bkt-4");
    cloud.deleteBucket("bkt-4");
    expect(cloud.listBuckets().map((b) => b.id)).not.toContain("bkt-4");
  });
});

describe("감사 로그", () => {
  it("성공·실패와 행위자를 기록한다", () => {
    const cloud = new MiniCloud({ transitionDelayMs: 0 });
    cloud.stopInstance("srv-0008", "agent");
    try {
      cloud.deleteInstance("srv-0001", "agent");
    } catch {
      /* 의도된 실패 */
    }
    expect(cloud.getAudit()).toEqual([
      expect.objectContaining({ actor: "agent", action: "instance.stop", ok: true }),
      expect.objectContaining({ actor: "agent", action: "instance.delete", ok: false, errorCode: "INVALID_STATE" }),
    ]);
  });
});
