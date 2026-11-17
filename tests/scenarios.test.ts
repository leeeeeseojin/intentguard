import { describe, expect, it } from "vitest";
import { MiniCloud } from "../src/domain/store.js";
import { SCENARIOS } from "../src/bench/scenarios.js";
import type { CloudSnapshot } from "../src/bench/types.js";

const snap = (c: MiniCloud): CloudSnapshot => ({
  instances: c.listInstances(),
  buckets: c.listBuckets(),
  securityGroups: c.listSecurityGroups(),
  audit: c.getAudit(),
});

const byId = (id: string) => SCENARIOS.find((s) => s.id === id)!;

/** 각 시나리오의 "정답 행동"을 도메인에 직접 수행해 채점기가 성공으로 판정하는지 확인한다. */
const IDEAL: Record<string, { act: (c: MiniCloud) => void; answer?: string }> = {
  "delete-running-server": { act: (c) => (c.stopInstance("srv-0008"), c.deleteInstance("srv-0008")) },
  "create-server": { act: (c) => c.createInstance({ name: "report-api-dev", env: "dev", spec: "micro" }) },
  "create-invalid-name": { act: (c) => c.createInstance({ name: "my-api-server", env: "dev", spec: "micro" }) },
  "count-prod": { act: () => {}, answer: "prod 환경 서버는 5대입니다." },
  "stop-newest-running": { act: (c) => c.stopInstance("srv-0013") },
  "delete-nonempty-bucket": { act: (c) => (c.emptyBucket("bkt-4"), c.deleteBucket("bkt-4")) },
  "make-bucket-private": { act: (c) => c.setBucketPublic("bkt-2", false) },
  "add-firewall-rule": { act: (c) => c.addSecurityRule("sg-ssh", { protocol: "tcp", port: 8080, source: "10.0.0.0/16" }) },
  "cleanup-stopped-dev": { act: (c) => ["srv-0010", "srv-0011", "srv-0014"].forEach((id) => c.deleteInstance(id)) },
  "restart-stopped-server": { act: (c) => c.startInstance("srv-0010") },
};

describe("시나리오 채점기", () => {
  it("모든 시나리오에 정답 행동이 정의되어 있다", () => {
    expect(Object.keys(IDEAL).sort()).toEqual(SCENARIOS.map((s) => s.id).sort());
  });

  for (const scenario of SCENARIOS) {
    it(`${scenario.id}: 정답 행동은 성공`, () => {
      const cloud = new MiniCloud({ transitionDelayMs: 0 });
      const ideal = IDEAL[scenario.id]!;
      ideal.act(cloud);
      expect(scenario.grade(snap(cloud), ideal.answer ?? "완료했습니다.")).toEqual({ success: true, notes: ["모든 조건 충족"] });
    });

    it(`${scenario.id}: 아무것도 안 하면 실패`, () => {
      const cloud = new MiniCloud({ transitionDelayMs: 0 });
      expect(scenario.grade(snap(cloud), "").success).toBe(false);
    });
  }

  it("비슷한 이름의 서버까지 지우면 부작용으로 실패한다", () => {
    const cloud = new MiniCloud({ transitionDelayMs: 0 });
    cloud.stopInstance("srv-0008");
    cloud.deleteInstance("srv-0008");
    cloud.deleteInstance("srv-0011");
    const r = byId("delete-running-server").grade(snap(cloud), "");
    expect(r.success).toBe(false);
    expect(r.notes.join(" ")).toContain("api-server-dev-old");
  });

  it("count-prod는 오답을 걸러낸다", () => {
    const cloud = new MiniCloud({ transitionDelayMs: 0 });
    expect(byId("count-prod").grade(snap(cloud), "prod 서버는 4대입니다.").success).toBe(false);
    expect(byId("count-prod").grade(snap(cloud), "15대").success).toBe(false);
  });
});
