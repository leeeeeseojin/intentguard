import { useCallback, useEffect, useState } from "react";
import type { AuditInput, AuditSummary } from "../../src/app/audits";
import { Landing } from "../src/demo/Landing";
import { api, messageOf } from "./api";
import { AuditView } from "./AuditView";
import { History } from "./History";
import { NewAudit } from "./NewAudit";
import { auditHref, auditIdFrom } from "./text";

// #check-<id>는 결과 화면, 나머지 해시는 홈 안의 구간이다.
const currentId = () => auditIdFrom(location.hash);

export function App() {
  const [id, setId] = useState(currentId);
  const [history, setHistory] = useState<AuditSummary[]>([]);
  const [agents, setAgents] = useState({ ready: true, antigravity: true, claudeCode: true });
  const ready = agents.ready;
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<AuditInput>();

  const refresh = useCallback(() => {
    api.list().then(setHistory, (err: unknown) => setError(messageOf(err)));
  }, []);

  useEffect(() => {
    const onHash = () => {
      setId(currentId());
      setError("");
    };
    window.addEventListener("hashchange", onHash);
    api.status().then(setAgents, (err: unknown) => setError(messageOf(err)));
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(refresh, [id, refresh]);

  // 홈을 그린 뒤에야 #audit 같은 구간으로 갈 수 있다.
  useEffect(() => {
    if (id) window.scrollTo(0, 0);
    else if (location.hash.length > 1) document.getElementById(location.hash.slice(1))?.scrollIntoView();
  }, [id]);

  const alerts = (
    <>
      {!ready && <p className="app-notice" role="alert">Antigravity CLI(agy)도 Claude Code(claude)도 찾을 수 없습니다. 둘 중 하나를 설치하고 로그인한 뒤 앱을 다시 켜 주세요.</p>}
      {error && <p className="app-notice" role="alert">{error}</p>}
    </>
  );

  if (!id) {
    return (
      <Landing
        audit={
          <div className="app embedded">
            {alerts}
            <NewAudit key={JSON.stringify(draft ?? null)} initial={draft} ready={ready} agents={agents} onStarted={(audit) => (location.hash = auditHref(audit.id))} />
            <History audits={history} />
          </div>
        }
      />
    );
  }

  return (
    <div className="app">
      <header className="app-top">
        <a className="app-product" href="#">IntentGuard</a>
        <a className="app-back" href="#audit">새 검사·지난 검사</a>
      </header>
      <main>
        {alerts}
        <AuditView
          key={id}
          id={id}
          onFinished={refresh}
          onOpen={(next) => (location.hash = auditHref(next))}
          onEdit={(input) => {
            setDraft(input);
            location.hash = "audit";
          }}
        />
      </main>
    </div>
  );
}
