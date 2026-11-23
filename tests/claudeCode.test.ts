import { describe, expect, it } from "vitest";
import type { ClaudeRunResult } from "../src/bench/claude.js";
import { isClaudeCode, toAgentResult } from "../src/audit/claudeCode.js";
import { judge } from "../src/audit/report.js";

const base: ClaudeRunResult = {
  durationMs: 1000,
  exitReason: "completed",
  numTurns: 4,
  costUsd: 0,
  tokens: { input: 10, cacheCreate: 0, cacheRead: 20, output: 3 },
  toolCalls: [],
  finalAnswer: "끝\nRESULT: confirmed",
  model: "claude-haiku-5-5",
  permissionDenials: 0,
  stderr: "",
};
const call = (name: string, isError = false, resultPreview = "ok") => ({ name, input: {}, isError, resultPreview });
const pass = { success: true, notes: [] };

describe("Claude Code 조작 결과 해석", () => {
  it("claude-code: 접두사로 조작 에이전트를 고른다", () => {
    expect(isClaudeCode("claude-code:claude-haiku-5-5")).toBe(true);
    expect(isClaudeCode("claude-sonnet-5-5-low")).toBe(false);
  });

  it("브라우저 도구 이름을 Antigravity와 같은 형식으로 맞춰 같은 판정 규칙을 적용한다", () => {
    const r = toAgentResult({ ...base, toolCalls: [call("mcp__browser__browser_snapshot"), call("mcp__browser__browser_click")] }, "claude-code:claude-haiku-5-5");
    expect(r.calls.map((c) => c.name)).toEqual(["browser_snapshot", "browser_click"]);
    expect(r).toMatchObject({ exit: "completed", steps: 4, model: "claude-haiku-5-5", outsideTools: [] });
    expect(judge(pass, r)).toBe("confirmed-success");
  });

  it("Playwright MCP가 본문으로 돌려준 오류도 실패한 호출로 센다", () => {
    const r = toAgentResult({ ...base, toolCalls: [call("mcp__browser__browser_click", false, "### Error\n<div> intercepts pointer events")] }, "claude-code:x");
    expect(r.calls[0]?.isError).toBe(true);
  });

  it("브라우저가 아닌 도구가 성공하면 격리가 깨진 것이므로 무효", () => {
    const r = toAgentResult({ ...base, toolCalls: [call("mcp__browser__browser_snapshot"), call("Bash")] }, "claude-code:x");
    expect(r.outsideTools).toEqual(["Bash"]);
    expect(judge(pass, r)).toBe("invalid");
  });

  it("실행 오류·빈 답·시간 초과를 구분한다", () => {
    expect(toAgentResult({ ...base, exitReason: "error", finalAnswer: "" }, "claude-code:x", "Claude Code를 실행할 수 없습니다").error).toContain("실행할 수 없습니다");
    expect(toAgentResult({ ...base, finalAnswer: "  " }, "claude-code:x").exit).toBe("error");
    expect(toAgentResult({ ...base, exitReason: "timeout" }, "claude-code:x").exit).toBe("timeout");
    expect(toAgentResult({ ...base, model: "" }, "claude-code:claude-sonnet-5-5").model).toBe("claude-sonnet-5-5");
  });
});
