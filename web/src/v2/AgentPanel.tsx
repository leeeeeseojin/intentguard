import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ApiError, guardApi, type Approval, type AuditEntry } from "../api";
import { CLOUD_CHANGED } from "./cloudEvents";

const ACTION_LABEL: Record<string, string> = {
  "instance.create": "서버 생성",
  "instance.stop": "서버 정지",
  "instance.start": "서버 시작",
  "instance.delete": "서버 삭제",
  "securityGroup.addRule": "보안 규칙 추가",
  "securityGroup.removeRule": "보안 규칙 삭제",
  "bucket.makePublic": "버킷 공개",
  "bucket.makePrivate": "버킷 비공개",
  "bucket.empty": "버킷 비우기",
  "bucket.delete": "버킷 삭제",
};

const DECISION_LABEL: Record<Approval["status"], string> = { pending: "대기", approved: "승인·실행됨", rejected: "거절됨", failed: "승인했으나 실행 실패" };

/**
 * IntentGuard 패널: 사람이 에이전트를 "감독"하는 자리.
 * - Human-in-the-loop: 위험 작업은 여기서 사람이 승인/거절한다 (에이전트가 밝힌 이유와 위험 요인을 함께 보여준다).
 * - Human-on-the-loop: 에이전트가 한 일을 실시간으로 보고, 필요하면 모든 변경을 즉시 멈춘다.
 */
export function AgentPanel() {
  const [paused, setPaused] = useState(false);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [activity, setActivity] = useState<AuditEntry[]>([]);
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const titleId = useId();

  const lastSeq = useRef(0);

  const load = useCallback(async () => {
    const [control, list, log] = await Promise.all([guardApi.getControl(), guardApi.listApprovals(), guardApi.listActivity()]);
    setPaused(control.paused);
    setApprovals(list);
    setActivity(log.filter((a) => a.actor === "agent"));
    // 승인 실행이나 다른 사용자·에이전트의 변경이 생기면 열려 있는 페이지가 목록을 다시 불러오게 한다 (P3).
    const seq = log.at(-1)?.seq ?? 0;
    if (seq !== lastSeq.current) {
      if (lastSeq.current !== 0 || seq !== 0) window.dispatchEvent(new Event(CLOUD_CHANGED));
      lastSeq.current = seq;
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 1500);
    return () => clearInterval(t);
  }, [load]);

  async function guarded(fn: () => Promise<unknown>) {
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiError ? `${e.body.message}${e.body.hint ? ` ${e.body.hint}` : ""}` : "요청에 실패했습니다.");
    }
    await load();
  }

  const pending = approvals.filter((a) => a.status === "pending");
  const decided = approvals.filter((a) => a.status !== "pending").slice(-5).reverse();

  return (
    <aside className="agent-panel" aria-labelledby={titleId}>
      <h2 id={titleId} className="agent-panel-title">
        IntentGuard · 에이전트 감독
      </h2>

      <div className="agent-control">
        <button role="switch" aria-checked={paused} className={paused ? "switch-v2 on danger" : "switch-v2"} onClick={() => void guarded(() => guardApi.setPaused(!paused))}>
          <span className="switch-knob" aria-hidden="true" />
          <span className="switch-text">에이전트 작업 일시정지</span>
        </button>
        <p className="agent-state" role="status">
          {paused ? "일시정지됨: 에이전트의 모든 변경 요청이 거부됩니다." : "실행 중: 위험한 작업만 사람 승인을 기다립니다."}
        </p>
      </div>

      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}

      <section aria-label="승인 대기">
        <h3 className="agent-section-title">승인 대기 {pending.length}건</h3>
        {pending.length === 0 && <p className="muted">승인을 기다리는 작업이 없습니다.</p>}
        {pending.map((a) => (
          <article key={a.id} className="approval-card" aria-label={`승인 요청 ${a.id}: ${a.risk.summary}`}>
            <div className="approval-summary">{a.risk.summary}</div>
            <ul className="approval-reasons">
              {a.risk.reasons.map((r) => (
                <li key={r}>위험: {r}</li>
              ))}
            </ul>
            <p className="approval-why">에이전트가 밝힌 이유: {a.agentReason ?? "(밝히지 않음)"}</p>
            <p className="muted">
              {a.id} · {new Date(a.requestedAt).toLocaleTimeString()}
            </p>
            <label className="field">
              <span className="field-label">거절 사유 (선택, 에이전트에게 전달)</span>
              <input className="input" value={rejectReason[a.id] ?? ""} onChange={(e) => setRejectReason({ ...rejectReason, [a.id]: e.target.value })} />
            </label>
            <div className="approval-actions">
              <button className="btn btn-primary btn-small" onClick={() => void guarded(() => guardApi.approve(a.id))}>
                승인하고 실행: {a.risk.summary}
              </button>
              <button className="btn btn-small" onClick={() => void guarded(() => guardApi.reject(a.id, rejectReason[a.id] ?? ""))}>
                거절
              </button>
            </div>
          </article>
        ))}
      </section>

      {decided.length > 0 && (
        <section aria-label="최근 결정">
          <h3 className="agent-section-title">최근 결정</h3>
          <ul className="activity-list">
            {decided.map((a) => (
              <li key={a.id}>
                <strong>{DECISION_LABEL[a.status]}</strong> · {a.risk.summary}
                {a.note && <div className="muted">{a.note}</div>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="최근 에이전트 활동">
        <h3 className="agent-section-title">최근 에이전트 활동</h3>
        {activity.length === 0 && <p className="muted">아직 에이전트 활동이 없습니다.</p>}
        <ol className="activity-list">
          {activity
            .slice(-8)
            .reverse()
            .map((a) => (
              <li key={a.seq} className={a.ok ? "" : "activity-fail"}>
                {new Date(a.at).toLocaleTimeString()} · {ACTION_LABEL[a.action] ?? a.action} · {a.target} · {a.ok ? "성공" : `실패 (${a.errorCode})`}
              </li>
            ))}
        </ol>
      </section>
    </aside>
  );
}
