import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { advise } from "../app/advice.js";
import { inputSchema } from "../app/audits.js";
import { describeInput, redact } from "./publish.js";
import { selfReport, toMarkdown, type AuditRecord, type Outcome } from "./report.js";
import { runJob, screenJob } from "./run.js";

const MEANING: Record<Outcome, string> = {
  "confirmed-success": "기준을 채웠고 에이전트도 확인했다고 보고",
  "unconfirmed-success": "기준은 채웠지만 에이전트는 확인 못 했다고 보고",
  "false-failure": "실제로는 됐는데 에이전트는 실패라고 보고",
  "false-success": "에이전트는 됐다고 했지만 기준을 못 채움",
  failure: "기준을 못 채웠고 에이전트도 실패를 인정",
  invalid: "한도·연결 오류 등으로 검사가 성립하지 않음. 사이트의 실패로 세지 않는다",
};

const TIMEOUT_MS = 240_000;

interface Options {
  /** 기록을 남길 폴더 */
  outRoot: string;
  run?: typeof runJob;
}

/**
 * IntentGuard 검사기를 MCP 도구로 노출한다. stdio로만 붙으므로 검사는 이 서버를 띄운 사람의 PC와
 * 그 사람이 로그인한 Antigravity CLI로 돈다. 다른 사람의 사용량이나 서버를 쓰지 않는다.
 */
export function createAuditMcpServer({ outRoot, run = runJob }: Options) {
  const server = new McpServer({ name: "intentguard", version: "0.1.0" });
  let busy = false;

  server.registerTool(
    "audit_site",
    {
      title: "웹사이트 에이전트 검사",
      description: [
        "다른 AI 에이전트에게 브라우저로 일을 시키고, 같은 브라우저의 마지막 상태로 코드가 채점한다. 판정은 이 도구의 결과를 그대로 쓰고 바꾸지 않는다.",
        "expect는 일이 끝나면 화면에 문구 전체가 그대로 보여야 할 글자다. 버튼·링크·메뉴·입력칸의 글자, 다른 문장의 일부, 시작 화면에 이미 있는 글자는 쓸 수 없다.",
        "저장되는 일(추가·수정·설정)은 persist=true로 새로고침 뒤에도 남는지 본다. allowWrites는 사용자가 본인 소유의 테스트 환경이라고 했을 때만 켠다.",
        "모델 1개당 1~4분 걸리고 사용자의 Antigravity 사용량을 쓴다. 1회 결과로 성공률이나 모델 순위를 말하지 않는다.",
      ].join(" "),
      inputSchema: {
        ...inputSchema.shape,
        allowWrites: inputSchema.shape.allowWrites.default(false),
        models: inputSchema.shape.models.default(["gemini-3.8-flash-low"]),
      },
      annotations: { openWorldHint: true, readOnlyHint: false, destructiveHint: false },
    },
    async (args, extra): Promise<CallToolResult> => {
      const parsed = inputSchema.safeParse(args);
      if (!parsed.success) return { isError: true, content: [{ type: "text", text: parsed.error.issues[0]?.message ?? "입력을 확인하세요." }] };
      if (busy) return { isError: true, content: [{ type: "text", text: "다른 검사가 진행 중입니다. 끝난 뒤 다시 요청하세요." }] };
      busy = true;

      const { url, task, expect, persist, allowWrites, models } = parsed.data;
      const job = screenJob({ id: "check", url, task, persist, allowWrites, checks: expect.map((exactText) => ({ exactText })) });
      const dir = path.join(outRoot, new Date().toISOString().replace(/[:.]/g, "-"));
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(outRoot, ".gitignore"), "*\n");

      const progressToken = extra._meta?.progressToken;
      let progress = 0;
      const report = (message: string) => {
        if (progressToken === undefined) return;
        void extra.sendNotification({ method: "notifications/progress", params: { progressToken, progress: ++progress, message } }).catch(() => {});
      };

      const records: AuditRecord[] = [];
      const runs = [];
      try {
        for (const [index, model] of models.entries()) {
          const name = `${String(index + 1).padStart(2, "0")}-${model}`;
          report(`${model} 검사 시작`);
          try {
            const record = await run({
              job,
              model,
              attempt: 1,
              dir,
              name,
              timeoutMs: TIMEOUT_MS,
              signal: extra.signal,
              onCall: (call) => call.name.startsWith("browser_") && report(`${model}: ${call.name.slice("browser_".length)} ${describeInput(call.input)}`),
            });
            records.push(record);
            const checks = record.grade.checks ?? [];
            runs.push({
              model,
              outcome: record.outcome,
              meaning: MEANING[record.outcome],
              agentSaid: selfReport(record.agent.answer),
              checks,
              notes: record.grade.notes.map((note) => redact(note)),
              cautions: record.cautions ?? [],
              lookAt: advise(record.outcome, checks, record.issues),
              steps: record.agent.steps,
              seconds: Math.round(record.agent.durationMs / 1000),
              error: record.outcome === "invalid" ? redact(record.agent.error).slice(0, 300) : undefined,
              evidence: { record: path.join(dir, `${name}.json`), screenshot: path.join(dir, `${name}.png`) },
            });
          } catch (err) {
            if (extra.signal.aborted) throw err;
            runs.push({ model, outcome: "not-run", error: redact(String(err instanceof Error ? err.message : err).split("\n")[0] ?? "").replace(/^check: /, "") });
          }
        }
      } catch {
        return { isError: true, content: [{ type: "text", text: "검사가 취소됐습니다." }] };
      } finally {
        busy = false;
        if (records.length) writeFileSync(path.join(dir, "report.md"), toMarkdown(records));
      }

      const result = {
        url,
        task,
        criteria: job.criteria,
        runs,
        report: records.length ? path.join(dir, "report.md") : undefined,
        rule: "채점은 검사기의 코드가 같은 브라우저의 마지막 상태로 했다. 에이전트의 보고(agentSaid)보다 outcome을 믿는다.",
      };
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: result };
    },
  );

  return server;
}
