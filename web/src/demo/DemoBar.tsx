import { useState } from "react";
import type { DemoRequest } from "./backend";
import "./demo-bar.css";

const SAMPLES = [
  { id: "stop-prod", label: "운영 서버 정지 (승인 필요)", path: "/api/instances/srv-0001/stop", body: undefined, reason: "비용 절감을 위해 트래픽이 적은 서버 정지" },
  { id: "publish", label: "운영 로그 버킷 공개 (승인 필요)", path: "/api/buckets/bkt-1/public", body: { public: true }, reason: "외부 파트너에게 로그 공유" },
  { id: "stop-dev", label: "개발 서버 정지 (바로 실행)", path: "/api/instances/srv-0008/stop", body: undefined, reason: "사용하지 않는 개발 서버 정지" },
];

/** 사람 방문자에게만 보인다. 에이전트로 연 탭은 실험과 같은 화면을 봐야 하므로 넣지 않는다. */
export function DemoBar({ ui, request }: { ui: "v1" | "v2"; request: DemoRequest }) {
  const [sampleId, setSampleId] = useState(SAMPLES[0]!.id);
  const [message, setMessage] = useState("");
  const other = ui === "v1" ? "v2" : "v1";

  async function send() {
    const sample = SAMPLES.find((s) => s.id === sampleId)!;
    const res = await request(sample.path, {
      method: "POST",
      headers: { "content-type": "application/json", "x-actor": "agent", "x-agent-reason": encodeURIComponent(sample.reason) },
      body: sample.body && JSON.stringify(sample.body),
    });
    if (res.status === 202) setMessage("승인 대기: 감독 패널에서 승인하거나 거절하세요.");
    else if (res.ok) setMessage("낮은 위험이라 바로 실행됐습니다.");
    else setMessage(((await res.json()) as { error: { message: string } }).error.message);
  }

  async function reset() {
    await request("/api/_reset", { method: "POST", headers: { "x-actor": "human" } });
    location.reload();
  }

  return (
    <aside className="demo-bar" aria-label="데모 도구">
      <a href="/">실험 소개</a>
      <span>모의 콘솔 {ui}</span>
      <a href={`/?ui=${other}`}>{other}로 전환</a>
      {ui === "v2" && (
        <>
          <select aria-label="체험할 에이전트 요청" value={sampleId} onChange={(e) => setSampleId(e.target.value)}>
            {SAMPLES.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
          <button type="button" onClick={() => void send()}>에이전트 요청 보내기</button>
        </>
      )}
      <button type="button" onClick={() => void reset()}>데모 초기화</button>
      <span className="demo-message" role="status" aria-label="데모 안내">{message}</span>
    </aside>
  );
}
