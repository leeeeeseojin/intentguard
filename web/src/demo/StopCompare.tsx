import { useEffect, useState } from "react";

type Phase = "idle" | "stopping" | "stopped";

const V2_STATE: Record<Phase, string> = { idle: "실행 중 (running)", stopping: "정지 중 (stopping)", stopped: "정지됨 (stopped)" };

/** 첫 화면 체험: 같은 정지 요청을 두 화면에 보냈을 때 v1은 그대로이고 v2만 바뀐다. */
export function StopCompare() {
  const [phase, setPhase] = useState<Phase>("idle");

  useEffect(() => {
    if (phase !== "stopping") return;
    const timer = setTimeout(() => setPhase("stopped"), 1200);
    return () => clearTimeout(timer);
  }, [phase]);

  return (
    <figure className="live">
      <div className="live-window">
        <div className="live-head">
          <strong>서버를 정지해 보세요</strong>
          <button type="button" className="cta live-run" disabled={phase === "stopping"} onClick={() => setPhase(phase === "idle" ? "stopping" : "idle")}>
            {phase === "idle" ? "서버 정지" : phase === "stopping" ? "정지하는 중" : "다시 해보기"}
          </button>
        </div>
        <div className="live-screens" aria-live="polite">
          <div>
            <span className="live-label">기존 v1</span>
            <div className="live-server">
              <b>log-collector-prod</b>
              <span className="live-state">운영중</span>
            </div>
            <p className="live-says">{phase === "stopped" ? "에이전트: “정지됐는지 확인하지 못했습니다.”" : "\u00a0"}</p>
          </div>
          <div>
            <span className="live-label">개선 v2</span>
            <div className="live-server">
              <b>log-collector-prod</b>
              <span className="live-state" data-state={phase}>{V2_STATE[phase]}</span>
            </div>
            <p className="live-says">{phase === "stopped" ? "에이전트: “정지된 것을 확인했습니다.”" : "\u00a0"}</p>
          </div>
        </div>
      </div>
      <figcaption>실제 실험의 정지 과제를 줄인 예시예요. 에이전트 보고는 요약했습니다.</figcaption>
    </figure>
  );
}
