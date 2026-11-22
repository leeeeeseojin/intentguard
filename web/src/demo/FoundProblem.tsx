import type { PublishedTask } from "../../../src/audit/publish";
import data from "./live-evidence.json";

const TASK = (data as PublishedTask[]).find((t) => new URL(t.url).hostname === "my-dugout.vercel.app");
const RUN = TASK?.runs.find((r) => r.outcome === "false-success" && r.issues.some((i) => i.kind === "click-blocked"));

/**
 * 첫 화면 예시: 실제 검사 한 건을 세 줄로 줄였다.
 * 문구는 이 기록에만 맞으므로, 기록이 없어지면 예시도 그리지 않는다(E2E가 잡는다).
 */
export function FoundProblem() {
  if (!TASK || !RUN) return null;
  const blocked = RUN.issues.find((i) => i.kind === "click-blocked")!.count;

  return (
    <figure className="live found" aria-label="실제 검사 결과 예시">
      <div className="live-window">
        <p className="found-site">
          <span>실제 검사 결과</span>
          <strong>{new URL(TASK.url).hostname}</strong>
        </p>
        <dl className="found-facts">
          <div>
            <dt>시킨 일</dt>
            <dd>한화 원정 경기로 설정하고 시작</dd>
          </div>
          <div>
            <dt>AI의 보고</dt>
            <dd>“경기 시작 버튼 클릭 → 경기 진행 시작”</dd>
          </div>
          <div className="found-truth">
            <dt>실제 상태</dt>
            <dd>경기가 시작되지 않음</dd>
          </div>
          <div>
            <dt>막힌 곳</dt>
            <dd>열린 설정창 뒤의 버튼을 누르려다 {blocked}번 막힘</dd>
          </div>
        </dl>
      </div>
      <figcaption>
        {RUN.model}의 실제 기록을 줄였습니다. <a href="#live">원본 기록 보기</a>
      </figcaption>
    </figure>
  );
}
