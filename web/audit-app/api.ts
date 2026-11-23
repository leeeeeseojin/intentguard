import type { Audit, AuditInput, AuditSummary } from "../../src/app/audits";

async function call<T>(path: string, body?: object): Promise<T> {
  const response = await fetch(
    path,
    body && { method: "POST", headers: { "content-type": "application/json", "x-intentguard": "app" }, body: JSON.stringify(body) },
  ).catch(() => {
    throw new Error("검사 앱과 연결이 끊겼습니다. 터미널에서 앱이 켜져 있는지 확인해 주세요.");
  });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "요청을 처리하지 못했습니다.");
  return data;
}

export const api = {
  status: () => call<{ ready: boolean; antigravity: boolean; claudeCode: boolean }>("/api/status"),
  list: () => call<AuditSummary[]>("/api/audits"),
  get: (id: string) => call<Audit>(`/api/audits/${id}`),
  start: (input: AuditInput) => call<Audit>("/api/audits", input),
  rerun: (id: string) => call<Audit>(`/api/audits/${id}/rerun`, {}),
  cancel: (id: string) => call<{ ok: boolean }>(`/api/audits/${id}/cancel`, {}),
};

export const screenUrl = (id: string, index: number) => `/api/audits/${id}/screens/${index}`;
export const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));
