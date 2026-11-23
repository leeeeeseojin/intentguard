import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { runClaude, type ClaudeRunResult } from "../bench/claude.js";
import type { ToolCall } from "../bench/types.js";
import { BROWSER_ALLOWED, BROWSER_DENIED, type AgentOptions, type AgentResult } from "./antigravity.js";

/** 이 접두사가 붙은 모델은 Antigravity CLI 대신 Claude Code가 조작한다. 예: claude-code:claude-haiku-5-5 */
export const CLAUDE_CODE = "claude-code:";
export const isClaudeCode = (model: string) => model.startsWith(CLAUDE_CODE);

/** 검사용 브라우저를 Claude Code에 붙일 때 쓰는 MCP 서버 이름. 도구는 mcp__browser__browser_click처럼 불린다. */
export const CLAUDE_BROWSER_SERVER = "browser";
const PREFIX = `mcp__${CLAUDE_BROWSER_SERVER}__`;

/** Claude Code의 실행 결과를 Antigravity와 같은 형식으로 바꾼다. 채점·판정은 두 에이전트에 똑같이 적용된다. */
export function toAgentResult(r: ClaudeRunResult, requestedModel: string, stderr = ""): AgentResult {
  const calls: ToolCall[] = r.toolCalls.map((c) => {
    const browser = c.name.startsWith(PREFIX);
    return {
      name: browser ? c.name.slice(PREFIX.length) : c.name,
      input: c.input,
      // Playwright MCP는 실패도 정상 응답 본문의 "### Error"로 돌려준다.
      isError: c.isError || c.resultPreview.startsWith("### Error"),
      resultPreview: c.resultPreview,
    };
  });
  const exit: AgentResult["exit"] = r.exitReason === "timeout" ? "timeout" : r.exitReason === "completed" && r.finalAnswer.trim() ? "completed" : "error";
  return {
    exit,
    answer: r.finalAnswer.trim(),
    model: r.model || requestedModel.slice(CLAUDE_CODE.length),
    steps: r.numTurns,
    durationMs: r.durationMs,
    tokens: { input: r.tokens.input, cacheRead: r.tokens.cacheRead, output: r.tokens.output },
    calls,
    // 기본 도구를 모두 끄므로 브라우저가 아닌 도구가 성공했다면 격리가 깨진 것이다.
    outsideTools: [...new Set(r.toolCalls.filter((c) => !c.name.startsWith(PREFIX) && !c.isError).map((c) => c.name))],
    error: exit === "completed" ? "" : (r.finalAnswer || stderr || `Claude Code가 ${r.exitReason}로 끝났습니다.`).slice(0, 500),
  };
}

/**
 * Claude Code를 격리해서 조작 에이전트로 쓴다. 90회 실험의 Web 경로와 같은 방식이다.
 * - 저장소 밖의 빈 폴더, 기본 도구 없음(--tools ""), 이 브라우저 MCP만(--strict-mcp-config)
 * - 사용자 설정·플러그인·세션 기록을 불러오거나 남기지 않는다(--setting-sources local, --no-session-persistence)
 * 사용량은 Claude Code에 로그인한 사람의 것이 든다.
 */
export async function runClaudeCode(o: AgentOptions): Promise<AgentResult> {
  const mcpCli = path.join(path.dirname(createRequire(import.meta.url).resolve("@playwright/mcp/package.json")), "cli.js");
  const mcpPath = path.join(o.workDir, "mcp.json");
  writeFileSync(
    mcpPath,
    JSON.stringify({
      mcpServers: {
        [CLAUDE_BROWSER_SERVER]: {
          command: process.execPath,
          args: [mcpCli, "--cdp-endpoint", o.cdpEndpoint, "--image-responses", "omit", "--output-dir", path.join(o.workDir, "pw-out")],
        },
      },
    }),
  );
  const model = o.model.slice(CLAUDE_CODE.length);
  const result = await runClaude({
    cwd: o.workDir,
    args: [
      "-p",
      "--model", model,
      "--output-format", "stream-json",
      "--verbose",
      "--tools", "",
      "--mcp-config", mcpPath,
      "--strict-mcp-config",
      "--allowedTools", ...BROWSER_ALLOWED.map((t) => `${PREFIX}browser_${t}`),
      "--disallowedTools", ...BROWSER_DENIED.map((t) => `${PREFIX}browser_${t}`),
      "--setting-sources", "local",
      "--no-session-persistence",
    ],
    prompt: o.prompt,
    timeoutMs: o.timeoutMs + 10_000,
    rawLogPath: o.logPath,
    signal: o.signal,
    onCall: o.onCall && ((call) => o.onCall!({ ...call, name: call.name.startsWith(PREFIX) ? call.name.slice(PREFIX.length) : call.name })),
  });
  return toAgentResult(result, o.model, result.stderr);
}
