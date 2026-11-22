import type { AppRun, Audit } from "../../src/app/audits";
import { modelName, runLabel, runTone } from "./text";

function Result({ run }: { run?: AppRun }) {
  if (!run) return <td>기록 없음</td>;
  const failed = run.steps.filter((step) => step.failed).length;
  return (
    <td>
      <strong data-tone={runTone(run)}>{runLabel(run)}</strong>
      <small>조작 {run.steps.length}번{failed > 0 && `, 실패한 조작 ${failed}번`}</small>
    </td>
  );
}

export function Compare({ before, after }: { before: Audit; after: Audit }) {
  return (
    <table className="compare">
      <caption>재검사 전후. 한 번씩 돌린 결과라 우연한 차이일 수 있습니다.</caption>
      <thead>
        <tr>
          <th scope="col">모델</th>
          <th scope="col"><a href={`#${before.id}`}>이전 (검사 {before.number})</a></th>
          <th scope="col">이번 (검사 {after.number})</th>
        </tr>
      </thead>
      <tbody>
        {after.runs.map((run) => (
          <tr key={run.model}>
            <th scope="row">{modelName(run.model)}</th>
            <Result run={before.runs.find((b) => b.model === run.model)} />
            <Result run={run} />
          </tr>
        ))}
      </tbody>
    </table>
  );
}
