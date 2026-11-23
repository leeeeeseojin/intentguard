import type { CrossResult, CrossRun } from "../../../src/audit/multiModel";
import data from "../../../docs/results/multi-model.json";

const RESULT = data as CrossResult;
const pct = (count: number, of: number) => (of ? `${Math.round((count / of) * 100)}%` : "-");

// src/audit/multiModel.ts는 node:fs를 쓰므로 타입만 가져오고, 같은 규칙(짝이 맞는 실행만)으로 여기서 센다.
function row(model: string, runs: CrossRun[]) {
  const result = { model, pairs: 0, v1: 0, v2: 0 };
  for (const before of runs.filter((r) => r.ui === "v1")) {
    const after = runs.find((r) => r.ui === "v2" && r.task === before.task && r.model === before.model);
    if (!after) continue;
    result.pairs++;
    if (before.outcome === "confirmed-success") result.v1++;
    if (after.outcome === "confirmed-success") result.v2++;
  }
  return result;
}

const TOTAL = row("전체", RESULT.runs);
const MODELS = [...new Set(RESULT.runs.map((r) => r.model))].sort().map((model) => row(model, RESULT.runs.filter((r) => r.model === model)));

export function CrossCheck() {
  const done = RESULT.valid >= RESULT.planned;
  return (
    <section className="chapter wide case-part" aria-labelledby="cross-check">
      <div className="chapter-head">
        <h3 id="cross-check">모델이 달라도 좋아질까?</h3>
        <p>
          같은 과제를 4개 모델로 다시 시켰더니, 결과까지 확인한 성공이{" "}
          <strong>
            {pct(TOTAL.v1, TOTAL.pairs)}에서 {pct(TOTAL.v2, TOTAL.pairs)}로
          </strong>{" "}
          늘었습니다.
        </p>
        <p className="fine">
          {done ? `${RESULT.valid}회 완료. ` : `중간 집계: 유효 ${RESULT.valid}/${RESULT.planned}회, 나머지는 측정 중입니다. `}
          같은 모델·같은 과제로 v1과 v2가 모두 끝난 {TOTAL.pairs}쌍을 비교했고, 사용 한도로 끊기거나 브라우저에 연결되지 못한 실행은 다시 돌렸습니다. 확인 여부는 에이전트의 자기 보고 표식입니다. 측정 중 사이트 배포가 두 번 바뀌었지만 콘솔 화면(접근성 트리·화면·정답 채점)은 같음을 확인했습니다.
        </p>
      </div>
      <div className="scroll" role="region" aria-label="모델별 교차 검증 표" tabIndex={0}>
        <table>
          <thead>
            <tr>
              <th scope="col">모델</th>
              <th scope="col">v1 확인된 성공</th>
              <th scope="col">v2 확인된 성공</th>
              <th scope="col">비교한 쌍</th>
            </tr>
          </thead>
          <tbody>
            {[TOTAL, ...MODELS].map((m) => (
              <tr key={m.model}>
                <th scope="row">{m.model}</th>
                <td>
                  {pct(m.v1, m.pairs)}
                  <small> ({m.v1}/{m.pairs})</small>
                </td>
                <td>
                  {pct(m.v2, m.pairs)}
                  <small> ({m.v2}/{m.pairs})</small>
                </td>
                <td>{m.pairs}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
