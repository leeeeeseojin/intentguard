import { useCallback, useEffect, useState } from "react";
import type { AuditInput, AuditSummary } from "../../src/app/audits";
import { api, messageOf } from "./api";
import { AuditView } from "./AuditView";
import { History } from "./History";
import { NewAudit } from "./NewAudit";

// 주소의 해시가 화면이다: #<검사 id> 는 결과, 없으면 새 검사.
const currentId = () => location.hash.slice(1);

export function App() {
  const [id, setId] = useState(currentId);
  const [history, setHistory] = useState<AuditSummary[]>([]);
  const [ready, setReady] = useState(true);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<AuditInput>();

  const refresh = useCallback(() => {
    api.list().then(setHistory, (err: unknown) => setError(messageOf(err)));
  }, []);

  useEffect(() => {
    const onHash = () => {
      setId(currentId());
      setError("");
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onHash);
    api.status().then((status) => setReady(status.ready), (err: unknown) => setError(messageOf(err)));
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(refresh, [id, refresh]);

  const open = (next: string) => {
    location.hash = next;
  };

  return (
    <div className="app">
      <header className="top">
        <a className="product" href="#" onClick={() => setDraft(undefined)}>IntentGuard</a>
        <p>내 PC에서 실행되는 검사 앱</p>
      </header>

      <main>
        {!ready && <p className="notice" role="alert">Antigravity CLI(agy)를 찾을 수 없습니다. 설치하고 로그인한 뒤 앱을 다시 켜 주세요.</p>}
        {error && <p className="notice" role="alert">{error}</p>}
        {id ? (
          <AuditView
            key={id}
            id={id}
            onFinished={refresh}
            onOpen={open}
            onEdit={(input) => {
              setDraft(input);
              open("");
            }}
          />
        ) : (
          <>
            <NewAudit key={JSON.stringify(draft ?? null)} initial={draft} ready={ready} onStarted={(audit) => open(audit.id)} />
            <History audits={history} />
          </>
        )}
      </main>
    </div>
  );
}
