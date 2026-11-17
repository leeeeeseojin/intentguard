import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type Instance } from "../api";
import { PlusIcon, RefreshIcon } from "../components/icons";
import { RowMenu } from "../components/RowMenu";
import { useToast } from "../components/Toast";
import { TypedConfirmModal } from "../components/TypedConfirmModal";
import { CreateServerWizard } from "./CreateServerWizard";

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
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Instance | null>(null);
  const toast = useToast();

  async function act(fn: () => Promise<unknown>, success: string) {
    try {
      await fn();
      toast("success", success);
    } catch (e) {
      toast("error", e instanceof ApiError ? e.body.message : "요청에 실패했습니다.");
    }
  }

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
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            <PlusIcon />
            서버 생성
          </button>
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
            <th />
          </tr>
        </thead>
        <tbody>
          {loading && items.length === 0 ? (
            <tr>
              <td colSpan={8} className="empty">
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
                <td className="actions-cell">
                  <RowMenu
                    items={[
                      { label: "서버 시작", onSelect: () => void act(() => api.startInstance(i.id), "서버 시작을 요청했습니다.") },
                      { label: "서버 정지", onSelect: () => void act(() => api.stopInstance(i.id), "서버 정지를 요청했습니다.") },
                      // v1-pattern: jargon-labels — '삭제' 대신 '반납'이라는 서비스 용어를 쓴다.
                      { label: "서버 반납", danger: true, onSelect: () => setDeleting(i) },
                    ]}
                  />
                </td>
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

      {/* v1-pattern: stale-list — 생성이 끝나도 목록을 다시 불러오지 않는다. 새로고침 아이콘을 눌러야 한다. */}
      {creating && <CreateServerWizard onClose={() => setCreating(false)} />}
      {deleting && (
        <TypedConfirmModal
          title="서버 반납"
          description="반납한 서버는 복구할 수 없습니다. 계속하려면 서버 이름을 입력하세요."
          expected={deleting.name}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await act(() => api.deleteInstance(deleting.id), "서버 반납을 요청했습니다.");
            setDeleting(null);
          }}
        />
      )}
    </section>
  );
}
