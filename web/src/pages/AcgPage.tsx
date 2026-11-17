import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type SecurityGroup } from "../api";
import { TrashIcon } from "../components/icons";
import { useToast } from "../components/Toast";

export function AcgPage() {
  const toast = useToast();
  const [groups, setGroups] = useState<SecurityGroup[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [protocol, setProtocol] = useState("tcp");
  const [port, setPort] = useState("");
  const [source, setSource] = useState("");
  const [description, setDescription] = useState("");

  const load = useCallback(async () => {
    const list = await api.listSecurityGroups();
    setGroups(list);
    setSelectedId((prev) => prev ?? list[0]?.id ?? null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = groups.find((g) => g.id === selectedId);

  async function act(fn: () => Promise<unknown>, success: string) {
    try {
      await fn();
      toast("success", success);
      await load();
      return true;
    } catch (e) {
      toast("error", e instanceof ApiError ? e.body.message : "요청에 실패했습니다.");
      return false;
    }
  }

  async function addRule() {
    if (!selected) return;
    const ok = await act(
      () => api.addRule(selected.id, { protocol, port: Number(port), source, description }),
      "규칙이 추가되었습니다.",
    );
    if (ok) {
      setPort("");
      setSource("");
      setDescription("");
    }
  }

  return (
    <section>
      <div className="page-header">
        {/* v1-pattern: jargon-labels — 'ACG'가 방화벽/보안 그룹이라는 설명이 없다. */}
        <h1>ACG</h1>
      </div>

      <div className="split">
        <div className="list-panel">
          {groups.map((g) => (
            // v1-pattern: div-controls — 선택 가능한 목록이 버튼/링크가 아니다.
            <div key={g.id} className={g.id === selectedId ? "list-item selected" : "list-item"} onClick={() => setSelectedId(g.id)}>
              <div className="list-item-name">{g.name}</div>
              <div className="list-item-sub">규칙 {g.rules.length}개</div>
            </div>
          ))}
        </div>

        <div className="detail-panel">
          {selected && (
            <>
              <h2 className="detail-title">{selected.name} · Inbound</h2>
              <table className="grid">
                <thead>
                  <tr>
                    <th>프로토콜</th>
                    <th>포트</th>
                    <th>접근 소스</th>
                    <th>메모</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {selected.rules.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="empty">
                        규칙이 없습니다.
                      </td>
                    </tr>
                  ) : (
                    selected.rules.map((r) => (
                      <tr key={r.id}>
                        <td>{r.protocol.toUpperCase()}</td>
                        <td>{r.port}</td>
                        <td>{r.source}</td>
                        <td>{r.description}</td>
                        <td className="actions-cell">
                          {/* v1-pattern: icon-only-buttons — 확인 없이 즉시 삭제된다. */}
                          <button className="icon-btn ghost" onClick={() => void act(() => api.removeRule(selected.id, r.id), "규칙이 삭제되었습니다.")}>
                            <TrashIcon />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

              {/* v1-pattern: placeholder-as-label */}
              <div className="rule-form">
                <select className="input" value={protocol} onChange={(e) => setProtocol(e.target.value)}>
                  <option value="tcp">TCP</option>
                  <option value="udp">UDP</option>
                </select>
                <input className="input" placeholder="포트" value={port} onChange={(e) => setPort(e.target.value)} />
                <input className="input" placeholder="0.0.0.0/0" value={source} onChange={(e) => setSource(e.target.value)} />
                <input className="input" placeholder="메모" value={description} onChange={(e) => setDescription(e.target.value)} />
                <button className="btn btn-primary" onClick={() => void addRule()}>
                  추가
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
