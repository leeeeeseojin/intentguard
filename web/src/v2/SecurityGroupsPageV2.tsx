import { useCallback, useEffect, useId, useState } from "react";
import { api, type SecurityGroup } from "../api";
import { useCloudChanged } from "./cloudEvents";
import { useStatus } from "./StatusRegion";

export function SecurityGroupsPageV2() {
  const { run } = useStatus();
  const [groups, setGroups] = useState<SecurityGroup[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [protocol, setProtocol] = useState("tcp");
  const [port, setPort] = useState("");
  const [source, setSource] = useState("");
  const [memo, setMemo] = useState("");
  const ids = { protocol: useId(), port: useId(), source: useId(), sourceHelp: useId(), memo: useId() };

  const load = useCallback(async () => {
    const list = await api.listSecurityGroups();
    setGroups(list);
    setSelectedId((prev) => prev ?? list[0]?.id ?? null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);
  useCloudChanged(load);

  const selected = groups.find((g) => g.id === selectedId);
  const portNum = Number(port);
  const portError = port && (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) ? "포트는 1~65535 사이 정수입니다." : "";
  const sourceError = source && !/^\d{1,3}(\.\d{1,3}){3}\/\d{1,2}$/.test(source) ? "CIDR 형식(예: 10.0.0.0/16)으로 입력하세요." : "";
  const missing = [!port && "포트", !source && "접근 허용 대역"].filter(Boolean) as string[];

  async function addRule() {
    if (!selected) return;
    const ok = await run(
      () => api.addRule(selected.id, { protocol, port: portNum, source, description: memo }),
      `${selected.name}에 ${protocol.toUpperCase()} ${port} ← ${source} 허용 규칙을 추가했습니다.`,
    );
    await load();
    if (ok) {
      setPort("");
      setSource("");
      setMemo("");
    }
  }

  return (
    <section aria-labelledby="sg-title">
      <div className="page-header">
        <div>
          <h1 id="sg-title">보안 그룹 (ACG)</h1>
          <p className="page-desc">서버로 들어오는 트래픽을 허용하는 방화벽 규칙입니다. ACG(Access Control Group)라고도 합니다.</p>
        </div>
      </div>

      <div className="split">
        <nav className="list-panel" aria-label="보안 그룹 목록">
          {groups.map((g) => (
            <button key={g.id} className={g.id === selectedId ? "list-item selected" : "list-item"} aria-pressed={g.id === selectedId} onClick={() => setSelectedId(g.id)}>
              <span className="list-item-name">{g.name}</span>
              <span className="list-item-sub">인바운드 규칙 {g.rules.length}개</span>
            </button>
          ))}
        </nav>

        <div className="detail-panel">
          {selected && (
            <>
              <h2 className="detail-title">{selected.name} · 인바운드 규칙</h2>
              <table className="grid" aria-label={`${selected.name} 인바운드 규칙`}>
                <thead>
                  <tr>
                    <th scope="col">프로토콜</th>
                    <th scope="col">포트</th>
                    <th scope="col">접근 허용 대역</th>
                    <th scope="col">메모</th>
                    <th scope="col">작업</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.rules.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="empty">
                        규칙이 없습니다. 모든 인바운드 트래픽이 차단됩니다.
                      </td>
                    </tr>
                  ) : (
                    selected.rules.map((r) => (
                      <tr key={r.id}>
                        <td>{r.protocol.toUpperCase()}</td>
                        <td>{r.port}</td>
                        <td>
                          {r.source}
                          {r.source === "0.0.0.0/0" && " (인터넷 전체)"}
                        </td>
                        <td>{r.description || "-"}</td>
                        <td>
                          <button
                            className="btn btn-small"
                            aria-label={`규칙 삭제: ${r.protocol.toUpperCase()} ${r.port} ← ${r.source}`}
                            onClick={async () => {
                              await run(() => api.removeRule(selected.id, r.id), `${r.protocol.toUpperCase()} ${r.port} ← ${r.source} 규칙을 삭제했습니다.`);
                              await load();
                            }}
                          >
                            <span aria-hidden="true">규칙 삭제</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

              <form
                className="rule-form-v2"
                aria-label={`${selected.name}에 인바운드 규칙 추가`}
                onSubmit={(e) => {
                  e.preventDefault();
                  void addRule();
                }}
              >
                <label className="field" htmlFor={ids.protocol}>
                  <span className="field-label">프로토콜</span>
                  <select id={ids.protocol} className="input" value={protocol} onChange={(e) => setProtocol(e.target.value)}>
                    <option value="tcp">TCP</option>
                    <option value="udp">UDP</option>
                  </select>
                </label>
                <label className="field" htmlFor={ids.port}>
                  <span className="field-label">포트</span>
                  <input id={ids.port} className="input" inputMode="numeric" value={port} aria-invalid={!!portError} onChange={(e) => setPort(e.target.value)} />
                  {portError && <span className="field-error">{portError}</span>}
                </label>
                <label className="field" htmlFor={ids.source}>
                  <span className="field-label">접근 허용 대역 (CIDR)</span>
                  <input
                    id={ids.source}
                    className="input"
                    value={source}
                    aria-describedby={ids.sourceHelp}
                    aria-invalid={!!sourceError}
                    onChange={(e) => setSource(e.target.value)}
                  />
                  <span className="field-help" id={ids.sourceHelp}>
                    예: 사내망 10.0.0.0/16, 특정 IP 203.0.113.7/32. 0.0.0.0/0은 인터넷 전체입니다.
                  </span>
                  {sourceError && <span className="field-error">{sourceError}</span>}
                  {source === "0.0.0.0/0" && <span className="field-warn">주의: 인터넷 전체에 포트가 열립니다.</span>}
                </label>
                <label className="field" htmlFor={ids.memo}>
                  <span className="field-label">메모 (선택)</span>
                  <input id={ids.memo} className="input" value={memo} onChange={(e) => setMemo(e.target.value)} />
                </label>
                <div className="form-actions">
                  {missing.length > 0 && <span className="footer-note">입력 필요: {missing.join(", ")}</span>}
                  <button type="submit" className="btn btn-primary" disabled={missing.length > 0 || !!portError || !!sourceError}>
                    규칙 추가
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
