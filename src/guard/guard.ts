import { CloudError } from "../domain/errors.js";
import type { MiniCloud } from "../domain/store.js";
import type { Actor } from "../domain/types.js";
import { execute, type Operation } from "./operations.js";
import { assessRisk, type RiskAssessment } from "./policy.js";

export type ApprovalStatus = "pending" | "approved" | "rejected" | "failed";

export interface Approval {
  id: string;
  status: ApprovalStatus;
  operation: Operation;
  risk: RiskAssessment;
  /** 에이전트가 밝힌 작업 이유 (선택) */
  agentReason?: string;
  requestedAt: string;
  decidedAt?: string;
  /** 거절 사유 또는 실행 실패 메시지 — 에이전트에게 그대로 전달된다 */
  note?: string;
  result?: unknown;
}

export interface PendingResponse {
  status: "pending_approval";
  approval: Approval;
  message: string;
}

export interface IntentGuardOptions {
  /** false면 승인 정책을 끈다 (일시정지는 계속 동작) */
  enabled?: boolean;
  now?: () => Date;
}

/**
 * IntentGuard: 에이전트의 행동과 사람의 의도 사이에 서는 플랫폼 정책 계층.
 * - 위험한 작업은 바로 실행하지 않고 사람 승인 대기열에 넣는다.
 * - 사람은 언제든 에이전트의 모든 변경 작업을 일시정지할 수 있다.
 * - Web·MCP·API 어느 경로로 와도 같은 정책이 적용된다.
 * - 사람이라고 밝히지 않은 요청(unknown)은 에이전트와 똑같이 제한한다.
 */
export class IntentGuard {
  private approvals: Approval[] = [];
  private counter = 0;
  private paused = false;
  private readonly enabled: boolean;
  private readonly now: () => Date;

  constructor(
    private readonly cloud: MiniCloud,
    options: IntentGuardOptions = {},
  ) {
    this.enabled = options.enabled ?? true;
    this.now = options.now ?? (() => new Date());
  }

  reset() {
    this.approvals = [];
    this.counter = 0;
    this.paused = false;
  }

  get isPaused() {
    return this.paused;
  }

  setPaused(paused: boolean, actor: Actor) {
    if (actor !== "human") throw new CloudError("FORBIDDEN", "에이전트는 일시정지 상태를 바꿀 수 없습니다.");
    this.paused = paused;
  }

  /** 상태를 바꾸는 요청의 단일 입구 */
  run(op: Operation, actor: Actor, agentReason?: string): unknown {
    if (actor === "human") return execute(this.cloud, op, actor);

    if (this.paused) {
      throw new CloudError(
        "AGENT_PAUSED",
        "사람이 에이전트 작업을 일시정지했습니다.",
        "작업을 멈추고 사용자에게 상황을 보고하세요. 일시정지가 풀리면 다시 시도할 수 있습니다.",
      );
    }

    const risk = assessRisk(this.cloud, op);
    if (!this.enabled || risk.level === "low") return execute(this.cloud, op, actor);

    const approval: Approval = {
      id: `apv-${++this.counter}`,
      status: "pending",
      operation: op,
      risk,
      agentReason,
      requestedAt: this.now().toISOString(),
    };
    this.approvals.push(approval);
    const response: PendingResponse = {
      status: "pending_approval",
      approval: structuredClone(approval),
      message: `위험 작업이라 사람의 승인이 필요합니다 (${risk.reasons.join(", ")}). 승인되면 IntentGuard가 대신 실행합니다. 같은 요청을 반복하지 말고 승인 상태(${approval.id})를 확인하세요.`,
    };
    return response;
  }

  list(status?: ApprovalStatus): Approval[] {
    return structuredClone(this.approvals.filter((a) => !status || a.status === status));
  }

  get(id: string): Approval {
    return structuredClone(this.find(id));
  }

  approve(id: string, actor: Actor): Approval {
    this.assertHuman(actor);
    const approval = this.findPending(id);
    approval.decidedAt = this.now().toISOString();
    try {
      approval.result = execute(this.cloud, approval.operation, "agent");
      approval.status = "approved";
    } catch (err) {
      // 승인했지만 그사이 상태가 바뀌어 실행에 실패할 수 있다 (예: 이미 삭제됨)
      approval.status = "failed";
      approval.note = err instanceof Error ? err.message : String(err);
    }
    return structuredClone(approval);
  }

  reject(id: string, actor: Actor, reason?: string): Approval {
    this.assertHuman(actor);
    const approval = this.findPending(id);
    approval.status = "rejected";
    approval.decidedAt = this.now().toISOString();
    approval.note = reason?.trim() || "사용자가 거절했습니다.";
    return structuredClone(approval);
  }

  private assertHuman(actor: Actor) {
    if (actor !== "human") throw new CloudError("FORBIDDEN", "에이전트는 스스로 승인하거나 거절할 수 없습니다.", "사용자의 결정을 기다리세요.");
  }

  private find(id: string): Approval {
    const a = this.approvals.find((x) => x.id === id);
    if (!a) throw new CloudError("NOT_FOUND", `승인 요청을 찾을 수 없습니다: ${id}`);
    return a;
  }

  private findPending(id: string): Approval {
    const a = this.find(id);
    if (a.status !== "pending") throw new CloudError("INVALID_STATE", `이미 처리된 승인 요청입니다 (${a.status}).`);
    return a;
  }
}
