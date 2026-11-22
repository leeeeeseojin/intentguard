import { describe, expect, it } from "vitest";
import { MCP_SERVER, parseStream } from "../src/audit/antigravity.js";
import { specSchema, storedMatches } from "../src/audit/grade.js";
import { findIssues, judge, selfReport } from "../src/audit/report.js";

const tool = (tool_name: string, state: string, parameters: object, output = "ok") =>
  JSON.stringify({ step_update: { step_type: "tool", tool_name, state, tool_info: { parameters, output } } });
const browser = (output = "ok") =>
  tool("call_mcp_tool", "DONE", { ServerName: MCP_SERVER, ToolName: "browser_click", Arguments: {} }, output);
const result = (response: string, status = "SUCCESS") =>
  JSON.stringify({ result: { status, response, usage: { input_tokens: 10, cache_read_tokens: 20, output_tokens: 3 } } });
const pass = { success: true, notes: [] };
const fail = { success: false, notes: ["x"] };

describe("Antigravity 출력 해석", () => {
  it("브라우저 호출·토큰·단계를 읽고 깨진 줄은 건너뛴다", () => {
    const step = JSON.stringify({ step_update: { step_type: "agent_response", state: "DONE" } });
    expect(parseStream(["깨진 줄", step, browser(), result("끝")])).toMatchObject({
      exit: "completed",
      steps: 1,
      tokens: { input: 10, cacheRead: 20, output: 3 },
      calls: [{ name: "browser_click", isError: false }],
      outsideTools: [],
    });
  });

  it("CLI가 보고한 모델명을 남긴다", () => {
    expect(parseStream([JSON.stringify({ init: { model: "gemini-x" } })]).model).toBe("gemini-x");
  });

  it("정상 응답에 담긴 Playwright 오류도 실패한 호출로 센다", () => {
    expect(parseStream([browser("### Error\n<aside> intercepts pointer events")]).calls[0]?.isError).toBe(true);
  });

  it("화면 밖 도구가 성공하면 기록하고, 거부된 시도는 무효로 만들지 않는다", () => {
    expect(parseStream([tool("run_command", "DONE", {})]).outsideTools).toEqual(["run_command"]);
    expect(parseStream([tool("run_command", "ERROR", {})]).outsideTools).toEqual([]);
  });

  it("다른 MCP 서버도 화면 밖 도구다", () => {
    expect(parseStream([tool("call_mcp_tool", "DONE", { ServerName: "github", ToolName: "x" })]).outsideTools).toEqual(["call_mcp_tool"]);
  });
});

describe("판정", () => {
  it.each([
    [pass, "RESULT: confirmed", "confirmed-success"],
    [pass, "RESULT: unconfirmed", "unconfirmed-success"],
    [pass, "RESULT: failed", "false-failure"],
    [pass, "표식 없음", "unconfirmed-success"],
    [fail, "RESULT: confirmed", "false-success"],
    [fail, "RESULT: failed", "failure"],
  ] as const)("%o + %s → %s", (grade, answer, expected) => {
    expect(judge(grade, parseStream([browser(), result(answer)]))).toBe(expected);
  });

  it("한도·연결 오류와 화면 밖 도구 사용은 통계에서 뺀다", () => {
    expect(judge(fail, parseStream([result("", "ERROR")]))).toBe("invalid");
    expect(judge(pass, parseStream([tool("run_command", "DONE", {}), result("RESULT: confirmed")]))).toBe("invalid");
  });

  it("도구를 쓰다가 CLI가 비정상 종료돼도 UX 실패로 세지 않는다", () => {
    expect(judge(fail, parseStream([browser(), result("")]))).toBe("invalid");
  });

  it.each(["**RESULT:** confirmed", "**RESULT: confirmed**", "RESULT: `confirmed`"])("마크다운으로 꾸민 %s도 읽는다", (answer) => {
    expect(selfReport(answer)).toBe("confirmed");
  });

  it("본문에서 언급한 표식보다 마지막 표식을 따른다", () => {
    expect(selfReport("RESULT: confirmed 라고 하려 했으나\nRESULT: failed")).toBe("failed");
  });

  it("가림은 UX 문제로, 잘못된 target은 도구 사용 오류로 구분한다", () => {
    const { calls } = parseStream([browser("### Error\n<aside> intercepts pointer events"), browser('### Error\n"x" is not a valid target')]);
    expect(findIssues(calls).map((i) => i.kind)).toEqual(["click-blocked", "agent-misuse"]);
  });
});

describe("성공 조건", () => {
  it("저장값은 적어둔 항목이 모두 같을 때만 통과", () => {
    expect(storedMatches('{"offense":"coach","defense":"me"}', { offense: "coach", defense: "me" })).toBe(true);
    expect(storedMatches('{"offense":"coach","defense":"coach"}', { offense: "coach", defense: "me" })).toBe(false);
    expect(storedMatches(null, { offense: "coach" })).toBe(false);
    expect(storedMatches("{broken", { offense: "coach" })).toBe(false);
  });

  it("조건에는 selector와 storage 중 하나가 있어야 한다", () => {
    const spec = (check: object) => ({ url: "https://a.example/", scenarios: [{ id: "x", task: "t", checks: [check] }] });
    expect(specSchema.safeParse(spec({ label: "빈 조건" })).success).toBe(false);
    expect(specSchema.safeParse(spec({ selector: "h1" })).success).toBe(true);
  });
});
