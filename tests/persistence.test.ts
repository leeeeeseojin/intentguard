import { afterEach, describe, expect, it, vi } from "vitest";
import { MiniCloud } from "../src/domain/store.js";
import { IntentGuard } from "../src/guard/guard.js";

afterEach(() => {
  vi.useRealTimers();
});

const roundTrip = (cloud: MiniCloud) => {
  const restored = new MiniCloud({ transitionDelayMs: 1500 });
  restored.importState(JSON.parse(JSON.stringify(cloud.exportState())));
  cloud.reset(); // 새로고침으로 예전 타이머가 사라진 상황
  return restored;
};

describe("상태 저장·복원", () => {
  it("전이 중에 복원해도 정지·시작·삭제가 끝까지 진행된다", () => {
    vi.useFakeTimers();
    const cloud = new MiniCloud({ transitionDelayMs: 1500 });
    cloud.stopInstance("srv-0008");
    cloud.startInstance("srv-0010");
    cloud.deleteInstance("srv-0011");

    const restored = roundTrip(cloud);
    vi.advanceTimersByTime(1500);

    expect(restored.getInstance("srv-0008").status).toBe("stopped");
    expect(restored.getInstance("srv-0010").status).toBe("running");
    expect(restored.listInstances().some((i) => i.id === "srv-0011")).toBe(false);
    expect(restored.getAudit()).toHaveLength(3);
  });

  it("생성 중에 복원해도 공인 IP를 받고 다음 id가 겹치지 않는다", () => {
    vi.useFakeTimers();
    const cloud = new MiniCloud({ transitionDelayMs: 1500 });
    const created = cloud.createInstance({ name: "first-dev", env: "dev", spec: "micro", assignPublicIp: true });

    const restored = roundTrip(cloud);
    vi.advanceTimersByTime(1500);

    expect(restored.getInstance(created.id)).toMatchObject({ status: "running", publicIp: "211.188.99.101" });
    expect(restored.createInstance({ name: "second-dev", env: "dev", spec: "micro" }).id).toBe("srv-0102");
  });

  it("승인 대기열과 일시정지를 복원한다", () => {
    const cloud = new MiniCloud({ transitionDelayMs: 0 });
    const guard = new IntentGuard(cloud);
    guard.run({ kind: "bucket.setPublic", id: "bkt-1", public: true }, "agent");
    guard.setPaused(true, "human");

    const restored = new IntentGuard(cloud);
    restored.importState(JSON.parse(JSON.stringify(guard.exportState())));

    expect(restored.isPaused).toBe(true);
    expect(restored.approve("apv-1", "human").status).toBe("approved");
  });
});
