import type { Bucket, Instance, SecurityGroup } from "../../src/domain/types";

export type { Bucket, Instance, SecurityGroup };

export interface ApiErrorBody {
  code: string;
  message: string;
  hint?: string;
}

export class ApiError extends Error {
  constructor(readonly body: ApiErrorBody) {
    super(body.message);
  }
}

/** 에이전트 실행기는 ?actor=agent 로 콘솔을 열어 감사 로그에서 사람과 구분한다. */
const actor = new URLSearchParams(location.search).get("actor") === "agent" ? "agent" : "human";

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { "content-type": "application/json", "x-actor": actor },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(json.error ?? { code: "HTTP_" + res.status, message: res.statusText });
  return json as T;
}

export const api = {
  listInstances: () => call<{ items: Instance[] }>("GET", "/instances").then((r) => r.items),
  createInstance: (input: { name: string; env: string; spec: string; zone: string; securityGroupId: string; assignPublicIp: boolean }) =>
    call<Instance>("POST", "/instances", input),
  stopInstance: (id: string) => call<Instance>("POST", `/instances/${id}/stop`),
  startInstance: (id: string) => call<Instance>("POST", `/instances/${id}/start`),
  deleteInstance: (id: string) => call<Instance>("DELETE", `/instances/${id}`),

  listSecurityGroups: () => call<{ items: SecurityGroup[] }>("GET", "/security-groups").then((r) => r.items),
  addRule: (sgId: string, rule: { protocol: string; port: number; source: string; description: string }) =>
    call<SecurityGroup>("POST", `/security-groups/${sgId}/rules`, rule),
  removeRule: (sgId: string, ruleId: string) => call<SecurityGroup>("DELETE", `/security-groups/${sgId}/rules/${ruleId}`),

  listBuckets: () => call<{ items: Bucket[] }>("GET", "/buckets").then((r) => r.items),
  setBucketPublic: (id: string, isPublic: boolean) => call<Bucket>("POST", `/buckets/${id}/public`, { public: isPublic }),
  emptyBucket: (id: string) => call<Bucket>("POST", `/buckets/${id}/empty`),
  deleteBucket: (id: string) => call<Bucket>("DELETE", `/buckets/${id}`),
};

// ---------- v2 · IntentGuard ----------

export type { Approval, PendingResponse } from "../../src/guard/guard";
export type { AuditEntry } from "../../src/domain/types";
import type { Approval, PendingResponse } from "../../src/guard/guard";
import type { AuditEntry } from "../../src/domain/types";

export const currentActor = actor;

/** 변경 요청의 결과가 사람 승인 대기인지 */
export function isPending(result: unknown): result is PendingResponse {
  return (result as { status?: string } | null)?.status === "pending_approval";
}

export const guardApi = {
  listApprovals: () => call<{ items: Approval[] }>("GET", "/approvals").then((r) => r.items),
  approve: (id: string) => call<Approval>("POST", `/approvals/${id}/approve`),
  reject: (id: string, reason: string) => call<Approval>("POST", `/approvals/${id}/reject`, { reason }),
  getControl: () => call<{ paused: boolean }>("GET", "/agent-control"),
  setPaused: (paused: boolean) => call<{ paused: boolean }>("POST", "/agent-control", { paused }),
  listActivity: () => call<{ items: AuditEntry[] }>("GET", "/activity").then((r) => r.items),
};
