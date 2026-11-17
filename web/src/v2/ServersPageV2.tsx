import { useCallback, useEffect, useId, useState } from "react";
import { api, type Instance } from "../api";
import { ActionMenu } from "./ActionMenu";
import { useCloudChanged } from "./cloudEvents";
import { ConfirmDialog } from "./ConfirmDialog";
import { CreateServerDialog } from "./CreateServerDialog";
import { useHashParams } from "./hashParams";
import { ENV_LABEL, STATUS_LABEL, TRANSITIONAL } from "./labels";
import { useStatus } from "./StatusRegion";

const PAGE_SIZE = 10;

export function ServersPageV2() {
  const { run } = useStatus();
  const [items, setItems] = useState<Instance[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Instance | null>(null);
  const [params, setParams] = useHashParams();
  const ids = { q: useId(), env: useId(), sort: useId() };

  const q = params.get("q") ?? "";
  const env = params.get("env") ?? "";
  const sort = params.get("sort") ?? "newest";
  const page = Number(params.get("page") ?? "1");

  const load = useCallback(async () => {
    setItems(await api.listInstances());
    setLoaded(true);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);
  useCloudChanged(load);

  // P3: 생성 중·정지 중 같은 전이 상태가 있으면 끝날 때까지 자동으로 다시 불러온다.
  const hasTransitional = items.some((i) => TRANSITIONAL.has(i.status));
  useEffect(() => {
    if (!hasTransitional) return;
    const t = setInterval(() => void load(), 1000);
    return () => clearInterval(t);
  }, [hasTransitional, load]);

  const filtered = items
    .filter((i) => !q || i.name.includes(q))
    .filter((i) => !env || i.env === env)
    .sort((a, b) => (sort === "oldest" ? a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt)));
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const visible = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  async function act(fn: () => Promise<unknown>, success: string) {
    await run(fn, success);
    await load();
  }

  return (
    <section aria-labelledby="servers-title">
      <div className="page-header">
        <h1 id="servers-title">서버</h1>
        <div className="toolbar">
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            서버 생성
          </button>
          <button className="btn" onClick={() => void load()}>
            목록 새로고침
          </button>
        </div>
      </div>

      <div className="filters" role="search">
        <label className="field-inline" htmlFor={ids.q}>
          <span>서버 이름 검색</span>
          <input id={ids.q} className="input" value={q} onChange={(e) => setParams({ q: e.target.value, page: "" })} />
        </label>
        <label className="field-inline" htmlFor={ids.env}>
          <span>환경</span>
          <select id={ids.env} className="input" value={env} onChange={(e) => setParams({ env: e.target.value, page: "" })}>
            <option value="">전체</option>
            <option value="dev">dev (개발)</option>
            <option value="staging">staging (스테이징)</option>
            <option value="prod">prod (운영)</option>
          </select>
        </label>
        <label className="field-inline" htmlFor={ids.sort}>
          <span>정렬</span>
          <select id={ids.sort} className="input" value={sort} onChange={(e) => setParams({ sort: e.target.value })}>
            <option value="newest">최근 생성순</option>
            <option value="oldest">오래된 순</option>
          </select>
        </label>
      </div>

      <p className="summary" aria-live="polite">
        {loaded ? `전체 ${items.length}대 중 조건에 맞는 서버 ${filtered.length}대 · ${current}/${pageCount} 페이지` : "불러오는 중…"}
        {hasTransitional && " · 상태가 바뀌는 서버가 있어 자동 갱신 중"}
      </p>

      <table className="grid" aria-label="서버 목록">
        <thead>
          <tr>
            <th scope="col">서버 이름</th>
            <th scope="col">환경</th>
            <th scope="col">상태</th>
            <th scope="col">사양</th>
            <th scope="col">Zone</th>
            <th scope="col">공인 IP</th>
            <th scope="col">생성일</th>
            <th scope="col">작업</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((i) => (
            <tr key={i.id}>
              <th scope="row" className="name-cell">
                {i.name}
              </th>
              <td>
                <span className={`env-badge env-${i.env}`}>{ENV_LABEL[i.env]}</span>
              </td>
              <td>
                <span className={`status status-${i.status}`}>{STATUS_LABEL[i.status]}</span>
              </td>
              <td>{i.spec}</td>
              <td>{i.zone}</td>
              <td>{i.publicIp ?? "없음"}</td>
              <td>{i.createdAt.slice(0, 10)}</td>
              <td className="actions-cell">
                <ActionMenu
                  target={i.name}
                  actions={[
                    {
                      label: "서버 시작",
                      disabledReason: i.status === "stopped" ? undefined : `정지된 서버만 시작할 수 있습니다 (현재: ${STATUS_LABEL[i.status]})`,
                      onSelect: () => void act(() => api.startInstance(i.id), `${i.name} 시작을 요청했습니다. 상태가 바뀔 때까지 자동 갱신합니다.`),
                    },
                    {
                      label: "서버 정지",
                      disabledReason: i.status === "running" ? undefined : `실행 중인 서버만 정지할 수 있습니다 (현재: ${STATUS_LABEL[i.status]})`,
                      onSelect: () => void act(() => api.stopInstance(i.id), `${i.name} 정지를 요청했습니다. 상태가 바뀔 때까지 자동 갱신합니다.`),
                    },
                    {
                      label: "서버 삭제",
                      danger: true,
                      disabledReason: i.status === "stopped" ? undefined : `먼저 서버를 정지해야 삭제할 수 있습니다 (현재: ${STATUS_LABEL[i.status]})`,
                      onSelect: () => setDeleting(i),
                    },
                  ]}
                />
              </td>
            </tr>
          ))}
          {loaded && visible.length === 0 && (
            <tr>
              <td colSpan={8} className="empty">
                조건에 맞는 서버가 없습니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {pageCount > 1 && (
        <nav className="pager" aria-label="페이지">
          {Array.from({ length: pageCount }, (_, n) => (
            <button
              key={n}
              className={n + 1 === current ? "page-btn current" : "page-btn"}
              aria-current={n + 1 === current ? "page" : undefined}
              aria-label={`${n + 1}페이지`}
              onClick={() => setParams({ page: String(n + 1) })}
            >
              {n + 1}
            </button>
          ))}
        </nav>
      )}

      {creating && <CreateServerDialog onClose={() => setCreating(false)} onCreated={() => void load()} />}
      {deleting && (
        <ConfirmDialog
          actionLabel={`${deleting.name} 서버 삭제`}
          targetName={deleting.name}
          consequences={[`${ENV_LABEL[deleting.env]} 환경의 서버 ${deleting.name}이(가) 영구 삭제됩니다.`, "삭제한 서버는 복구할 수 없습니다."]}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await act(() => api.deleteInstance(deleting.id), `${deleting.name} 삭제를 시작했습니다. 목록에서 사라질 때까지 자동 갱신합니다.`);
            setDeleting(null);
          }}
        />
      )}
    </section>
  );
}
