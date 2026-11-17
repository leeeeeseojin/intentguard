import { useCallback, useEffect, useState } from "react";
import { api, type Instance } from "../api";
import { RefreshIcon } from "../components/icons";

const PAGE_SIZE = 10;

const ENV_COLOR: Record<Instance["env"], string> = { dev: "#2fb36b", staging: "#f0a020", prod: "#e5484d" };

const STATUS_LABEL: Record<Instance["status"], string> = {
  creating: "생성중",
  running: "운영중",
  stopping: "정지중",
  stopped: "정지",
  starting: "시작중",
  deleting: "반납중",
};

export function ServersPage() {
  const [items, setItems] = useState<Instance[]>([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await api.listInstances());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // v1-pattern: hidden-pagination — 생성일 오래된 순 10개씩. 검색창이 없어 최근 서버는 2페이지에 있다.
  const sorted = [...items].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const visible = sorted.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  return (
    <section>
      <div className="page-header">
        <h1>Server</h1>
        <div className="toolbar">
          {/* v1-pattern: icon-only-buttons — 접근성 이름(aria-label/title)이 없는 아이콘 버튼 */}
          <button className="icon-btn" onClick={() => void load()}>
            <RefreshIcon />
          </button>
        </div>
      </div>

      <table className="grid">
        <thead>
          <tr>
            <th />
            <th>서버 이름</th>
            <th>상태</th>
            <th>서버 타입</th>
            <th>Zone</th>
            <th>공인 IP</th>
            <th>생성 일시</th>
          </tr>
        </thead>
        <tbody>
          {loading && items.length === 0 ? (
            <tr>
              <td colSpan={7} className="empty">
                불러오는 중…
              </td>
            </tr>
          ) : (
            visible.map((i) => (
              <tr key={i.id}>
                <td>
                  {/* v1-pattern: color-only-env — 환경(dev/staging/prod)을 색 점으로만 구분한다. */}
                  <span className="env-dot" style={{ background: ENV_COLOR[i.env] }} />
                </td>
                <td className="name-cell">{i.name}</td>
                <td>
                  <span className={`status status-${i.status}`}>{STATUS_LABEL[i.status]}</span>
                </td>
                <td>{i.spec}</td>
                <td>{i.zone}</td>
                <td>{i.publicIp ?? "-"}</td>
                <td>{i.createdAt.slice(0, 10)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <div className="pager">
        {Array.from({ length: pageCount }, (_, n) => (
          <button key={n} className={n === page ? "page-btn current" : "page-btn"} onClick={() => setPage(n)}>
            {n + 1}
          </button>
        ))}
      </div>
    </section>
  );
}
