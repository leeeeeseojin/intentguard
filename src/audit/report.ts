import type { GradeResult, ToolCall } from "../bench/types.js";
import type { AgentResult } from "./antigravity.js";

export type SelfReport = "confirmed" | "unconfirmed" | "failed" | "none";

/** 문장을 정규식으로 해석하면 틀린다. 마지막에 정해진 표식으로 스스로 보고하게 한다. */
export function selfReport(answer: string): SelfReport {
  const last = [...answer.matchAll(/RESULT:\s*(confirmed|unconfirmed|failed)\b/g)].at(-1);
  return (last?.[1] as SelfReport | undefined) ?? "none";
}

export type Outcome = "confirmed-success" | "unconfirmed-success" | "false-failure" | "false-success" | "failure" | "invalid";

export function judge(grade: GradeResult, agent: Pick<AgentResult, "exit" | "answer" | "calls" | "outsideTools">): Outcome {
  // 비정상 종료(한도·연결·권한 설정 오류)와 화면 밖 도구를 쓴 실행은 성공·실패 어느 쪽으로도 세지 않는다.
  if (agent.outsideTools.length) return "invalid";
  if (agent.exit === "error") return "invalid";
  const said = selfReport(agent.answer);
  if (!grade.success) return said === "confirmed" ? "false-success" : "failure";
  if (said === "confirmed") return "confirmed-success";
  return said === "failed" ? "false-failure" : "unconfirmed-success";
}

export interface Issue {
  kind: string;
  count: number;
  fix: string;
  evidence: string;
}

const RULES: { kind: string; match: RegExp; fix: string }[] = [
  { kind: "click-blocked", match: /intercepts pointer events/, fix: "다른 요소가 덮고 있다. 레이아웃·z-index·열려 있는 모달을 확인" },
  { kind: "disabled-control", match: /element is not enabled/, fix: "비활성 이유와 먼저 할 일을 화면에 표시" },
  { kind: "agent-misuse", match: /is not a valid target|To use the element with \[ref=|Provide either "text" or "regex"|read_file|Invalid arguments|invalid_type|Ref .* not found/, fix: "에이전트의 도구 사용 오류. UX 결함으로 세지 않음" },
  { kind: "ambiguous-target", match: /strict mode violation/, fix: "같은 이름의 요소가 여럿이다. 이름에 대상을 포함" },
  { kind: "target-not-found", match: /does not match any elements|waiting for (locator|getBy)/, fix: "접근성 이름·역할이 화면 문구와 같은지 확인" },
  { kind: "permission-denied", match: /permission check failed/, fix: "막아둔 수단으로 우회를 시도. 화면만으로 부족한 정보가 있는지 확인" },
];

/** 실패한 도구 호출을 원인별로 묶는다. 원인 추정의 출발점이지 확정이 아니다. */
export function findIssues(calls: ToolCall[]): Issue[] {
  const issues = new Map<string, Issue>();
  for (const call of calls) {
    if (!call.isError) continue;
    const rule = RULES.find((r) => r.match.test(call.resultPreview));
    const kind = rule?.kind ?? "other-tool-error";
    const seen = issues.get(kind);
    if (seen) seen.count++;
    else issues.set(kind, { kind, count: 1, fix: rule?.fix ?? "원본 로그 확인", evidence: call.resultPreview.replace(/\s+/g, " ").slice(0, 220) });
  }
  return [...issues.values()];
}

export interface AuditRecord {
  id: string;
  target: string;
  model: string;
  attempt: number;
  outcome: Outcome;
  grade: GradeResult;
  issues: Issue[];
  blocked: string[];
  agent: AgentResult;
}

const cell = (text: string) => text.replace(/[|\r\n]+/g, " ");

export function toMarkdown(records: AuditRecord[]): string {
  const valid = records.filter((r) => r.outcome !== "invalid");
  const ok = valid.filter((r) => r.grade.success).length;
  const confirmed = valid.filter((r) => r.outcome === "confirmed-success").length;
  const lines = [
    "# 배포 URL 에이전트 검사",
    "",
    `- 에이전트: Antigravity CLI · ${records[0]?.model ?? "-"}`,
    `- 유효 실행 ${valid.length}/${records.length} · 성공 ${ok} · 확인된 성공 ${confirmed}`,
    "- 채점: 같은 브라우저의 최종 상태. 확인 여부: 에이전트가 남긴 RESULT 표식",
    "- 단계 수는 모델 응답 횟수라서 Claude Code 실험의 턴 수와 비교할 수 없다",
    "",
    "| 과제 | 대상 | 회차 | 판정 | 단계 | 시간 | 막힌 곳 | 채점 근거 |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...records.map(
      (r) =>
        `| ${r.id} | ${cell(r.target)} | ${r.attempt} | ${r.outcome} | ${r.agent.steps} | ${Math.round(r.agent.durationMs / 1000)}초 | ${r.issues.map((i) => `${i.kind}×${i.count}`).join(", ") || "-"} | ${cell(r.grade.notes.join(" / "))} |`,
    ),
  ];
  const issues = records.flatMap((r) => r.issues.map((i) => ({ r, i })));
  if (issues.length) {
    lines.push("", "## 막힌 곳과 확인할 것", "");
    for (const { r, i } of issues) lines.push(`- **${r.id} · ${i.kind}**: ${i.fix}`, `  - 근거: ${cell(i.evidence)}`);
  }
  return `${lines.join("\n")}\n`;
}
