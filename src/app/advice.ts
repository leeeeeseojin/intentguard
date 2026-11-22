import type { CheckResult } from "../audit/grade.js";
import type { Issue, Outcome } from "../audit/report.js";

export interface Advice {
  title: string;
  action: string;
  evidence?: string;
}

const SITE_ISSUES: Record<string, string> = {
  "click-blocked": "누르려던 요소가 다른 것에 가려짐",
  "disabled-control": "비활성 버튼을 누르려 함",
  "ambiguous-target": "같은 이름의 요소가 여럿",
  "target-not-found": "누르려던 요소를 찾지 못함",
};

/** 기록에서 규칙으로만 뽑는다. 원인 확정이 아니라 고치기 전에 볼 곳이다. AI는 관여하지 않는다. */
export function advise(outcome: Outcome, checks: CheckResult[], issues: Issue[]): Advice[] {
  if (outcome === "invalid") return [];
  // 에이전트의 도구 사용 실수는 사이트의 문제가 아니다.
  const advice: Advice[] = issues.flatMap(({ kind, count, fix, evidence }) => {
    const title = SITE_ISSUES[kind];
    return title ? [{ title: `${title} ${count}번`, action: fix, evidence }] : [];
  });
  if (outcome === "unconfirmed-success" || outcome === "false-failure") {
    advice.push({ title: "됐는데 에이전트가 알아보지 못함", action: "작업 결과를 사라지지 않는 글자로 보여주고, 상태가 접근성 트리에도 남는지 확인" });
  }
  if (outcome === "false-success") {
    advice.push({ title: "안 됐는데 됐다고 믿음", action: "실패·진행 중이 성공처럼 보이지 않는지, 최종 결과와 실패 이유가 글자로 보이는지 확인" });
  }
  for (const check of checks.filter((c) => !c.met)) {
    advice.push({ title: `기준을 못 채움: ${check.label}`, action: "마지막 화면과 조작 기록에서 어느 단계까지 갔는지 확인", evidence: check.reason });
  }
  return advice;
}
