import type { GradeResult, ToolCall } from "../bench/types.js";
import type { AgentResult } from "./antigravity.js";
import type { CheckResult } from "./grade.js";

export type SelfReport = "confirmed" | "unconfirmed" | "failed" | "none";

/** 문장을 정규식으로 해석하면 틀린다. 마지막에 정해진 표식으로 스스로 보고하게 한다. */
export function selfReport(answer: string): SelfReport {
  const last = [...answer.matchAll(/RESULT[*_`\s]*:[*_`\s]*(confirmed|unconfirmed|failed)\b/g)].at(-1);
  return (last?.[1] as SelfReport | undefined) ?? "none";
}

export type Outcome = "confirmed-success" | "unconfirmed-success" | "false-failure" | "false-success" | "failure" | "invalid";

/** 조건별 결과는 화면 채점에만 있다. error는 채점기가 화면을 읽지 못한 경우. */
export type AuditGrade = GradeResult & { checks?: CheckResult[]; error?: boolean };

export function judge(grade: AuditGrade, agent: Pick<AgentResult, "exit" | "answer" | "calls" | "outsideTools">): Outcome {
  // 비정상 종료(한도·연결·권한 설정 오류)와 화면 밖 도구를 쓴 실행은 성공·실패 어느 쪽으로도 세지 않는다.
  if (agent.outsideTools.length) return "invalid";
  if (agent.exit === "error") return "invalid";
  // 브라우저에 연결되지 못한 실행은 화면을 시험한 것이 아니다.
  if (!agent.calls.some((c) => c.name.startsWith("browser_") && !c.isError)) return "invalid";
  if (grade.error) return "invalid";
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

/** 긴 호출 로그에서 원인이 적힌 줄을 근거로 남긴다. */
function evidenceOf(output: string, match?: RegExp): string {
  const plain = output.replace(/\u001b\[[0-9;]*m/g, "");
  const line = match && plain.split("\n").find((l) => match.test(l));
  return (line || plain).replace(/\s+/g, " ").trim().slice(0, 220);
}

/** 실패한 도구 호출을 원인별로 묶는다. 원인 추정의 출발점이지 확정이 아니다. */
export function findIssues(calls: ToolCall[]): Issue[] {
  const issues = new Map<string, Issue>();
  for (const call of calls) {
    if (!call.isError) continue;
    const rule = RULES.find((r) => r.match.test(call.resultPreview));
    const kind = rule?.kind ?? "other-tool-error";
    const seen = issues.get(kind);
    if (seen) seen.count++;
    else issues.set(kind, { kind, count: 1, fix: rule?.fix ?? "원본 로그 확인", evidence: evidenceOf(call.resultPreview, rule?.match) });
  }
  return [...issues.values()];
}

export interface AuditRecord {
  id: string;
  target: string;
  /** 에이전트에게 시킨 문장 그대로 */
  task: string;
  /** 사람이 읽는 성공 조건 */
  criteria: string[];
  startedAt: string;
  model: string;
  attempt: number;
  outcome: Outcome;
  grade: AuditGrade;
  issues: Issue[];
  blocked: string[];
  /** 판정은 그대로 두고 사람이 더 확인할 점 */
  cautions?: string[];
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
    `- 조작한 모델: ${[...new Set(records.map((r) => r.model))].join(", ") || "-"} (Antigravity CLI 또는 Claude Code)`,
    `- 유효 실행 ${valid.length}/${records.length} · 성공 ${ok} · 확인된 성공 ${confirmed}`,
    "- 채점: 같은 브라우저의 최종 상태. 확인 여부: 에이전트가 남긴 RESULT 표식",
    "- 단계 수는 모델 응답 횟수라서 Claude Code 실험의 턴 수와 비교할 수 없다",
    "",
    "| 모델 | 과제 | 대상 | 회차 | 판정 | 단계 | 시간 | 막힌 곳 | 채점 근거 |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...records.map(
      (r) =>
        `| ${r.model} | ${r.id} | ${cell(r.target)} | ${r.attempt} | ${r.outcome} | ${r.agent.steps} | ${Math.round(r.agent.durationMs / 1000)}초 | ${r.issues.map((i) => `${i.kind}×${i.count}`).join(", ") || "-"} | ${cell(r.grade.notes.join(" / "))} |`,
    ),
  ];
  const issues = records.flatMap((r) => r.issues.map((i) => ({ r, i })));
  if (issues.length) {
    lines.push("", "## 막힌 곳과 확인할 것", "");
    for (const { r, i } of issues) lines.push(`- **${r.id} · ${i.kind}**: ${i.fix}`, `  - 근거: ${cell(i.evidence)}`);
  }
  const cautions = records.flatMap((r) => (r.cautions ?? []).map((text) => `- **${r.id} · ${r.model}**: ${cell(text)}`));
  if (cautions.length) lines.push("", "## 판정을 믿기 전에", "", ...cautions);
  return `${lines.join("\n")}\n`;
}
