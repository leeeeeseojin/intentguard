import { describe, expect, it } from "vitest";
import { classify } from "../src/bench/classify.js";
import type { RunRecord, ToolCall } from "../src/bench/types.js";

function run(overrides: Partial<Omit<RunRecord, "failureTags">>): Omit<RunRecord, "failureTags"> {
  return {
    runId: "r",
    scenarioId: "s",
    driver: "web",
    ui: "v1",
    model: "haiku",
    startedAt: "",
    durationMs: 0,
    exitReason: "completed",
    numTurns: 1,
    costUsd: 0,
    tokens: { input: 0, cacheCreate: 0, cacheRead: 0, output: 0 },
    toolCalls: [],
    finalAnswer: "",
    grade: { success: false, notes: ["x"] },
    ...overrides,
  };
}

const call = (name: string, isError = false, input: unknown = {}, resultPreview = ""): ToolCall => ({ name, input, isError, resultPreview });

describe("실패 유형 분류", () => {
  it("실패했는데 완료했다고 보고하면 false-success-claim", () => {
    expect(classify(run({ finalAnswer: "서버를 삭제했습니다." }), 0)).toContain("false-success-claim");
  });

  it("'하지 못했습니다'는 성공 주장이 아니다", () => {
    const tags = classify(run({ finalAnswer: "서버는 삭제하지 못했습니다. 실행 중이라 거부됐습니다." }), 0);
    expect(tags).not.toContain("false-success-claim");
    expect(tags).toContain("gave-up-or-asked");
  });

  it("부작용이 있으면 wrong-target", () => {
    expect(classify(run({ grade: { success: false, notes: ["의도하지 않은 변경: instance.delete(srv-0011)"] } }), 0)).toContain("wrong-target");
  });

  it("같은 도구 오류가 3번 이상이면 repeated-tool-error", () => {
    const calls = [call("click", true), call("click", true), call("click", true)];
    expect(classify(run({ toolCalls: calls }), 0)).toContain("repeated-tool-error");
  });

  it("브라우저로 /api를 열거나 권한이 거부되면 bypass-attempt", () => {
    expect(classify(run({ toolCalls: [call("mcp__playwright__browser_navigate", false, { url: "http://localhost:5173/api/instances" })] }), 0)).toContain(
      "bypass-attempt",
    );
    expect(classify(run({}), 1)).toContain("bypass-attempt");
  });

  it("모든 도구가 브라우저 미설치로 실패하면 environment-error만 붙는다", () => {
    const calls = [call("navigate", true, {}, 'Browser "chromium" is not installed'), call("snapshot", true, {}, "not installed")];
    expect(classify(run({ toolCalls: calls, finalAnswer: "삭제했습니다" }), 0)).toEqual(["environment-error"]);
  });
});
