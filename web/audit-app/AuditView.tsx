import { useEffect, useState } from "react";
import type { Audit, AuditInput } from "../../src/app/audits";
import { api, messageOf } from "./api";
import { Compare } from "./Compare";
import { RunDetail } from "./RunDetail";
import { AUDIT_STATE, modelName, runLabel, runTone } from "./text";

interface Props {
  id: string;
  onFinished: () => void;
  onOpen: (id: string) => void;
  onEdit: (input: AuditInput) => void;
}

const POLL_MS = 1000;

export function AuditView({ id, onFinished, onOpen, onEdit }: Props) {
  const [audit, setAudit] = useState<Audit>();
  const [before, setBefore] = useState<Audit>();
  const [picked, setPicked] = useState<number>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let timer: number | undefined;
    let alive = true;
    const poll = async () => {
      try {
        const next = await api.get(id);
        if (!alive) return;
        setAudit(next);
        setError("");
        if (next.state !== "running") return onFinished();
      } catch (err) {
        if (!alive) return;
        setError(messageOf(err));
      }
      timer = window.setTimeout(() => void poll(), POLL_MS);
    };
    void poll();
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [id, onFinished]);

  const previous = audit?.previous;
  useEffect(() => {
    if (previous) api.get(previous).then(setBefore, () => setBefore(undefined));
  }, [previous]);

  if (!audit) return <p role="status">{error || "불러오는 중…"}</p>;

  const { input, runs, state } = audit;
  const running = state === "running";
  // 고르지 않았으면 지금 돌고 있는 모델, 다 끝났으면 첫 모델을 보여준다.
  const active = runs.findIndex((run) => ["starting", "working", "grading"].includes(run.state));
  const shown = picked ?? Math.max(0, active);

  async function act(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="app-audit">
      <div className="app-audit-head">
        <div>
          <p className="app-eyebrow" role="status">검사 {audit.number} · {AUDIT_STATE[state]}</p>
          <h1>{input.task}</h1>
        </div>
        <div className="app-actions">
          {running ? (
            <button type="button" className="app-quiet" disabled={busy} onClick={() => void act(() => api.cancel(id))}>검사 중단</button>
          ) : (
            <>
              <button type="button" className="app-quiet" onClick={() => onEdit(input)}>조건 바꿔 검사</button>
              <button type="button" className="app-primary" disabled={busy} onClick={() => void act(async () => onOpen((await api.rerun(id)).id))}>
                같은 조건으로 재검사
              </button>
            </>
          )}
        </div>
      </div>

      {error && <p className="app-notice" role="alert">{error}</p>}

      <dl className="app-brief">
        <div>
          <dt>주소</dt>
          <dd>{input.url}</dd>
        </div>
        <div>
          <dt>성공 기준</dt>
          <dd>{input.expect.map((text) => `“${text}”`).join(", ")}</dd>
        </div>
        <div>
          <dt>확인 범위</dt>
          <dd>{input.persist ? "새로고침 뒤에도 남는지" : "끝난 화면에 보이는지 (저장 여부는 보지 않음)"}</dd>
        </div>
      </dl>

      {before && <Compare before={before} after={audit} />}

      {runs.length > 1 && (
        <div className="app-runs" role="group" aria-label="모델별 결과">
          {runs.map((run, index) => (
            <button type="button" key={run.model} className="app-run" aria-pressed={index === shown} onClick={() => setPicked(index)}>
              <span>{modelName(run.model)}</span>
              <strong data-tone={runTone(run)}>{runLabel(run)}</strong>
            </button>
          ))}
        </div>
      )}

      <RunDetail auditId={id} index={shown} run={runs[shown]!} />
    </article>
  );
}
