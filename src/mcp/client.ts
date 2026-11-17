/** MiniCloud REST API를 호출하는 얇은 클라이언트. MCP 서버와 에이전트 실행기가 함께 쓴다. */

export interface ApiErrorBody {
  code: string;
  message: string;
  hint?: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiErrorBody,
  ) {
    super(body.message);
    this.name = "ApiError";
  }
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface ApiClientOptions {
  baseUrl?: string;
  actor?: "human" | "agent";
  fetch?: FetchLike;
}

export function createApiClient(options: ApiClientOptions = {}) {
  const baseUrl = (options.baseUrl ?? "http://localhost:8787").replace(/\/$/, "");
  const doFetch: FetchLike = options.fetch ?? ((input, init) => fetch(input, init));
  const actor = options.actor ?? "agent";

  async function call<T>(method: string, path: string, body?: unknown, reason?: string): Promise<T> {
    const headers: Record<string, string> = { "content-type": "application/json", "x-actor": actor };
    // 위험 작업 승인 카드에 보여줄 에이전트의 작업 이유
    if (reason) headers["x-agent-reason"] = encodeURIComponent(reason);
    const res = await doFetch(`${baseUrl}/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: ApiErrorBody };
    if (!res.ok) {
      throw new ApiError(res.status, json.error ?? { code: "HTTP_" + res.status, message: res.statusText });
    }
    return json as T;
  }

  return {
    get: <T>(path: string) => call<T>("GET", path),
    post: <T>(path: string, body?: unknown, reason?: string) => call<T>("POST", path, body ?? {}, reason),
    del: <T>(path: string, reason?: string) => call<T>("DELETE", path, undefined, reason),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
