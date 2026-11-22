import { useState } from "react";
import type { PublishedRun, PublishedTask } from "../../../src/audit/publish";
import data from "./live-evidence.json";
import "./evidence.css";

const TASKS = data as PublishedTask[];

const OUTCOME: Record<PublishedRun["outcome"], string> = {
  "confirmed-success": "성공 · 확인했다고 보고",
  "unconfirmed-success": "성공 · 확인 못 했다고 보고",
  "false-failure": "성공했는데 실패로 보고",
  "false-success": "실패했는데 성공으로 보고",
  failure: "실패",
  invalid: "무효 (실행 오류)",
};

const ISSUE: Record<string, string> = {
  "click-blocked": "누르려던 버튼이 다른 요소에 가려짐",
  "disabled-control": "비활성 버튼을 누르려 함",
  "ambiguous-target": "같은 이름의 요소가 여럿",
  "target-not-found": "누르려던 요소를 찾지 못함",
};

const label = (url: string) => {
  const { hostname, searchParams } = new URL(url);
  const ui = searchParams.get("ui");
  return ui ? `${hostname} (${ui})` : hostname;
};

const hasIssue = (run: PublishedRun) => run.issues.length > 0;
const FIRST_TASK = Math.max(0, TASKS.findIndex((t) => t.runs.some(hasIssue)));
const FIRST_RUN = Math.max(0, TASKS[FIRST_TASK]?.runs.findIndex(hasIssue) ?? 0);

export function LiveEvidence() {
  // 첫 화면 예시와 같은 '문제를 찾은 기록'부터 연다.
  const [taskIndex, setTaskIndex] = useState(FIRST_TASK);
  const [runIndex, setRunIndex] = useState(FIRST_RUN);
  const task = TASKS[taskIndex]!;
  const run = task.runs[runIndex]!;

  return (
    <div className="evidence">
      <label className="evidence-pick">
        테스트한 사이트
        <select
          className="input"
          value={taskIndex}
          onChange={(e) => {
            setTaskIndex(Number(e.target.value));
            setRunIndex(0);
          }}
        >
          {TASKS.map((t, i) => (
            <option key={`${t.url} ${t.task}`} value={i}>{label(t.url)}</option>
          ))}
        </select>
      </label>

      <dl className="evidence-brief">
        <div>
          <dt>주소</dt>
          <dd><a href={task.url} target="_blank" rel="noreferrer">{task.url}</a></dd>
        </div>
        <div>
          <dt>시킨 일</dt>
          <dd>{task.task}</dd>
        </div>
        <div>
          <dt>성공 조건</dt>
          <dd>{task.criteria.join(" · ")}</dd>
        </div>
      </dl>

      <div className="evidence-runs" role="group" aria-label="모델별 결과">
        {task.runs.map((r, i) => (
          <button type="button" key={i} className="evidence-run" aria-pressed={i === runIndex} onClick={() => setRunIndex(i)}>
            <span className="evidence-model">{r.model}</span>
            <span className={`evidence-outcome outcome-${r.outcome}`}>{OUTCOME[r.outcome]}</span>
            <span className="fine">{r.seconds}초</span>
          </button>
        ))}
      </div>

      <div className="evidence-detail">
        {run.screenshot && (
          <figure className="evidence-shot">
            <a href={run.screenshot} target="_blank" rel="noreferrer">
              <img src={run.screenshot} width={1280} height={800} loading="lazy" alt={`${run.model}이 작업을 끝낸 순간의 화면`} />
            </a>
            <figcaption className="fine">
              에이전트가 끝낸 순간의 실제 화면
            </figcaption>
          </figure>
        )}
        <div className="evidence-log">
          <h3>채점</h3>
          <p>{run.notes.join(" / ")}</p>
          {run.issues.length > 0 && (
            <>
              <h3>막힌 곳과 확인할 점</h3>
              {run.issues.map((issue) => (
                <p key={issue.kind}>
                  <strong>{ISSUE[issue.kind] ?? issue.kind} {issue.count}번.</strong> {issue.fix}
                  <code className="evidence-cause">{issue.evidence}</code>
                </p>
              ))}
            </>
          )}
          <h3>에이전트의 보고</h3>
          <p className="evidence-answer">{run.answer.replaceAll("**", "") || "보고 없이 끝남"}</p>
          <details>
            <summary>에이전트가 한 조작 {run.actions.length}번 보기</summary>
            <ol className="evidence-actions">
              {run.actions.map((a, i) => (
                <li key={i}>
                  <code>{a.tool}</code> {a.detail}
                  {a.failed && <strong> 실패</strong>}
                </li>
              ))}
            </ol>
          </details>
        </div>
      </div>
    </div>
  );
}
