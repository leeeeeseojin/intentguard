import { beforeEach, describe, expect, it } from "vitest";
import { MiniCloud } from "../src/domain/store.js";
import { IntentGuard, type PendingResponse } from "../src/guard/guard.js";
import { assessRisk } from "../src/guard/policy.js";

describe("위험도 판단", () => {
  const cloud = new MiniCloud({ transitionDelayMs: 0 });

  it.each([
    [{ kind: "instance.delete", id: "srv-0002" } as const, "high"],
    [{ kind: "instance.delete", id: "srv-0008" } as const, "low"],
    [{ kind: "bucket.setPublic", id: "bkt-1", public: true } as const, "high"],
    [{ kind: "bucket.setPublic", id: "bkt-2", public: false } as const, "low"],
    [{ kind: "bucket.empty", id: "bkt-1" } as const, "high"],
    [{ kind: "bucket.empty", id: "bkt-4" } as const, "low"],
    [{ kind: "securityGroup.addRule", sgId: "sg-ssh", input: { protocol: "tcp", port: 22, source: "0.0.0.0/0" } } as const, "high"],
    [{ kind: "securityGroup.addRule", sgId: "sg-ssh", input: { protocol: "tcp", port: 8080, source: "10.0.0.0/16" } } as const, "low"],
    [{ kind: "instance.create", input: { name: "big-dev", env: "dev", spec: "large" } } as const, "high"],
    [{ kind: "instance.stop", id: "srv-0013" } as const, "low"],
  ])("%o → %s", (op, level) => {
    expect(assessRisk(cloud, op).level).toBe(level);
  });
});

describe("IntentGuard", () => {
  let cloud: MiniCloud;
  let guard: IntentGuard;

  beforeEach(() => {
    cloud = new MiniCloud({ transitionDelayMs: 0 });
    guard = new IntentGuard(cloud);
  });

  it("사람의 요청은 위험해도 바로 실행한다", () => {
    guard.run({ kind: "bucket.setPublic", id: "bkt-1", public: true }, "human");
    expect(cloud.listBuckets().find((b) => b.id === "bkt-1")?.public).toBe(true);
    expect(guard.list()).toHaveLength(0);
  });

  it("에이전트의 낮은 위험 작업은 바로 실행한다", () => {
    guard.run({ kind: "instance.stop", id: "srv-0008" }, "agent");
    expect(cloud.getInstance("srv-0008").status).toBe("stopped");
  });

  it("에이전트의 위험 작업은 승인 대기로 보류하고 실행하지 않는다", () => {
    const res = guard.run({ kind: "bucket.setPublic", id: "bkt-1", public: true }, "agent", "로그 공유 요청") as PendingResponse;
    expect(res.status).toBe("pending_approval");
    expect(res.approval.risk.reasons[0]).toContain("인터넷에 공개");
    expect(res.approval.agentReason).toBe("로그 공유 요청");
    expect(cloud.listBuckets().find((b) => b.id === "bkt-1")?.public).toBe(false);
    expect(cloud.getAudit()).toHaveLength(0);
  });

  it("사람이 승인하면 에이전트 이름으로 실행된다", () => {
    const { approval } = guard.run({ kind: "bucket.setPublic", id: "bkt-1", public: true }, "agent") as PendingResponse;
    const decided = guard.approve(approval.id, "human");
    expect(decided.status).toBe("approved");
    expect(cloud.listBuckets().find((b) => b.id === "bkt-1")?.public).toBe(true);
    expect(cloud.getAudit()).toEqual([expect.objectContaining({ actor: "agent", action: "bucket.makePublic", ok: true })]);
  });

  it("거절하면 실행하지 않고 사유를 남긴다", () => {
    const { approval } = guard.run({ kind: "instance.delete", id: "srv-0002" }, "agent") as PendingResponse;
    const decided = guard.reject(approval.id, "human", "운영 서버는 삭제하지 마세요");
    expect(decided).toMatchObject({ status: "rejected", note: "운영 서버는 삭제하지 마세요" });
    expect(cloud.getInstance("srv-0002").status).toBe("running");
  });

  it("승인 후 실행이 실패하면 failed와 원인을 남긴다", () => {
    const { approval } = guard.run({ kind: "instance.delete", id: "srv-0002" }, "agent") as PendingResponse;
    const decided = guard.approve(approval.id, "human");
    expect(decided.status).toBe("failed");
    expect(decided.note).toContain("정지 상태가 아니라");
  });

  it("에이전트는 스스로 승인하거나 일시정지를 풀 수 없다", () => {
    const { approval } = guard.run({ kind: "instance.delete", id: "srv-0002" }, "agent") as PendingResponse;
    expect(() => guard.approve(approval.id, "agent")).toThrowError(expect.objectContaining({ code: "FORBIDDEN" }));
    expect(() => guard.setPaused(false, "agent")).toThrowError(expect.objectContaining({ code: "FORBIDDEN" }));
  });

  it("일시정지 중에는 에이전트의 모든 변경을 막지만 사람은 계속 작업할 수 있다", () => {
    guard.setPaused(true, "human");
    expect(() => guard.run({ kind: "instance.stop", id: "srv-0008" }, "agent")).toThrowError(
      expect.objectContaining({ code: "AGENT_PAUSED" }),
    );
    guard.run({ kind: "instance.stop", id: "srv-0008" }, "human");
    expect(cloud.getInstance("srv-0008").status).toBe("stopped");
  });

  it("출처를 밝히지 않은 요청도 에이전트처럼 제한한다", () => {
    const res = guard.run({ kind: "bucket.setPublic", id: "bkt-1", public: true }, "unknown") as PendingResponse;
    expect(res.status).toBe("pending_approval");
    expect(() => guard.approve(res.approval.id, "unknown")).toThrowError(expect.objectContaining({ code: "FORBIDDEN" }));
    expect(() => guard.reject(res.approval.id, "unknown")).toThrowError(expect.objectContaining({ code: "FORBIDDEN" }));
    expect(() => guard.setPaused(false, "unknown")).toThrowError(expect.objectContaining({ code: "FORBIDDEN" }));
  });

  it("이미 처리된 요청은 다시 결정할 수 없다", () => {
    const { approval } = guard.run({ kind: "bucket.setPublic", id: "bkt-1", public: true }, "agent") as PendingResponse;
    guard.reject(approval.id, "human");
    expect(() => guard.approve(approval.id, "human")).toThrowError(expect.objectContaining({ code: "INVALID_STATE" }));
  });
});
