import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { ApiError, type ApiClient } from "./client.js";

const env = z.enum(["dev", "staging", "prod"]);
const id = (what: string) => z.string().describe(`${what} id (예: srv-0008). 이름이 아니라 id를 넣어야 한다.`);
const reason = z.string().optional().describe("이 작업을 하는 이유. 사람 승인이 필요할 때 승인 화면에 그대로 보여준다.");
const APPROVAL_NOTE =
  " 위험한 작업(운영 리소스 삭제, 외부 공개, 고비용 등)은 IntentGuard가 사람 승인을 요구할 수 있다. 결과의 status가 pending_approval이면 같은 요청을 반복하지 말고 get_approval로 결정을 확인한다.";

function ok(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function fail(err: unknown): CallToolResult {
  if (err instanceof ApiError) {
    const { code, message, hint } = err.body;
    return {
      isError: true,
      content: [{ type: "text", text: `[${code}] ${message}${hint ? `\n다음 행동: ${hint}` : ""}` }],
    };
  }
  const message = err instanceof Error ? err.message : String(err);
  return { isError: true, content: [{ type: "text", text: `[NETWORK] MiniCloud API에 연결할 수 없습니다: ${message}` }] };
}

async function run(fn: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    return ok(await fn());
  } catch (err) {
    return fail(err);
  }
}

/**
 * MiniCloud를 MCP 도구로 노출한다.
 * 도구 설명과 annotations(readOnly/destructive)는 에이전트가 경로를 고를 때 쓰는 정보라서
 * "Web 콘솔 vs MCP" 비교 실험의 변수이기도 하다.
 */
export function createMcpServer(api: ApiClient) {
  const server = new McpServer({ name: "minicloud", version: "0.1.0" });

  // ---------- 서버 ----------
  server.registerTool(
    "list_instances",
    {
      title: "서버 목록 조회",
      description: "서버(인스턴스) 목록을 조회한다. env, status, 이름 일부로 필터링할 수 있다.",
      inputSchema: {
        env: env.optional(),
        status: z.enum(["creating", "running", "stopping", "stopped", "starting", "deleting"]).optional(),
        name_contains: z.string().optional(),
      },
      annotations: { readOnlyHint: true },
    },
    ({ env, status, name_contains }) => {
      const qs = new URLSearchParams();
      if (env) qs.set("env", env);
      if (status) qs.set("status", status);
      if (name_contains) qs.set("q", name_contains);
      const suffix = qs.size ? `?${qs}` : "";
      return run(() => api.get(`/instances${suffix}`));
    },
  );

  server.registerTool(
    "get_instance",
    {
      title: "서버 상세 조회",
      description: "서버 하나의 현재 상태를 조회한다. 생성·정지·삭제 후 상태 전이를 확인할 때 쓴다.",
      inputSchema: { id: id("서버") },
      annotations: { readOnlyHint: true },
    },
    ({ id }) => run(() => api.get(`/instances/${encodeURIComponent(id)}`)),
  );

  server.registerTool(
    "create_instance",
    {
      title: "서버 생성",
      description:
        "서버를 생성한다. 생성 직후 상태는 creating이며 잠시 후 running이 된다. 월 비용: micro 9,000원, small 24,000원, medium 52,000원, large 110,000원.",
      inputSchema: {
        name: z.string().describe("영문 소문자로 시작, 소문자·숫자·하이픈, 3~31자"),
        env,
        spec: z.enum(["micro", "small", "medium", "large"]),
        zone: z.enum(["KR-1", "KR-2"]).optional(),
        security_group_id: z.string().optional().describe("기본값 sg-default"),
        assign_public_ip: z.boolean().optional(),
        reason,
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    ({ security_group_id, assign_public_ip, reason, ...rest }) =>
      run(() => api.post("/instances", { ...rest, securityGroupId: security_group_id, assignPublicIp: assign_public_ip }, reason)),
  );

  server.registerTool(
    "stop_instance",
    {
      title: "서버 정지",
      description: "실행 중인 서버를 정지한다. 상태는 stopping을 거쳐 stopped가 된다.",
      inputSchema: { id: id("서버") },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    ({ id }) => run(() => api.post(`/instances/${encodeURIComponent(id)}/stop`)),
  );

  server.registerTool(
    "start_instance",
    {
      title: "서버 시작",
      description: "정지된 서버를 시작한다.",
      inputSchema: { id: id("서버") },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    ({ id }) => run(() => api.post(`/instances/${encodeURIComponent(id)}/start`)),
  );

  server.registerTool(
    "delete_instance",
    {
      title: "서버 삭제",
      description: `서버를 영구 삭제(반납)한다. stopped 상태인 서버만 삭제할 수 있다. 되돌릴 수 없다.${APPROVAL_NOTE}`,
      inputSchema: { id: id("서버"), reason },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    ({ id, reason }) => run(() => api.del(`/instances/${encodeURIComponent(id)}`, reason)),
  );

  // ---------- 보안 그룹 ----------
  server.registerTool(
    "list_security_groups",
    {
      title: "보안 그룹 목록 조회",
      description: "보안 그룹(방화벽)과 인바운드 규칙 목록을 조회한다.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    () => run(() => api.get("/security-groups")),
  );

  server.registerTool(
    "add_security_rule",
    {
      title: "인바운드 규칙 추가",
      description: "보안 그룹에 인바운드 규칙을 추가한다. source가 0.0.0.0/0이면 인터넷 전체에 열린다.",
      inputSchema: {
        security_group_id: z.string(),
        protocol: z.enum(["tcp", "udp"]),
        port: z.number().int().min(1).max(65535),
        source: z.string().describe("CIDR, 예: 203.0.113.7/32"),
        description: z.string().optional(),
        reason,
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    ({ security_group_id, reason, ...rule }) =>
      run(() => api.post(`/security-groups/${encodeURIComponent(security_group_id)}/rules`, rule, reason)),
  );

  server.registerTool(
    "remove_security_rule",
    {
      title: "인바운드 규칙 삭제",
      description: "보안 그룹에서 인바운드 규칙을 삭제한다.",
      inputSchema: { security_group_id: z.string(), rule_id: z.string() },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    ({ security_group_id, rule_id }) =>
      run(() => api.del(`/security-groups/${encodeURIComponent(security_group_id)}/rules/${encodeURIComponent(rule_id)}`)),
  );

  // ---------- 버킷 ----------
  server.registerTool(
    "list_buckets",
    {
      title: "버킷 목록 조회",
      description: "오브젝트 스토리지 버킷 목록과 공개 여부, 객체 수를 조회한다.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    () => run(() => api.get("/buckets")),
  );

  server.registerTool(
    "set_bucket_public",
    {
      title: "버킷 공개 설정 변경",
      description: "버킷을 공개(public=true) 또는 비공개로 바꾼다. 공개하면 인터넷 누구나 객체를 읽을 수 있다.",
      inputSchema: { id: z.string(), public: z.boolean(), reason },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    ({ id, public: isPublic, reason }) => run(() => api.post(`/buckets/${encodeURIComponent(id)}/public`, { public: isPublic }, reason)),
  );

  server.registerTool(
    "empty_bucket",
    {
      title: "버킷 비우기",
      description: `버킷의 모든 객체를 영구 삭제한다. 되돌릴 수 없다.${APPROVAL_NOTE}`,
      inputSchema: { id: z.string(), reason },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    ({ id, reason }) => run(() => api.post(`/buckets/${encodeURIComponent(id)}/empty`, undefined, reason)),
  );

  server.registerTool(
    "delete_bucket",
    {
      title: "버킷 삭제",
      description: `빈 버킷을 삭제한다. 객체가 남아 있으면 실패한다.${APPROVAL_NOTE}`,
      inputSchema: { id: z.string(), reason },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    ({ id, reason }) => run(() => api.del(`/buckets/${encodeURIComponent(id)}`, reason)),
  );

  // ---------- IntentGuard ----------
  server.registerTool(
    "get_approval",
    {
      title: "승인 요청 상태 조회",
      description:
        "pending_approval로 보류된 작업의 사람 결정을 조회한다. approved면 IntentGuard가 이미 실행했으므로 다시 요청하지 않는다. rejected면 note의 사유를 사용자에게 전하고 작업을 멈춘다.",
      inputSchema: { id: z.string().describe("승인 요청 id (예: apv-1)") },
      annotations: { readOnlyHint: true },
    },
    ({ id }) => run(() => api.get(`/approvals/${encodeURIComponent(id)}`)),
  );

  return server;
}
