import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type Bucket } from "../api";
import { RefreshIcon } from "../components/icons";
import { RowMenu } from "../components/RowMenu";
import { useToast } from "../components/Toast";
import { TypedConfirmModal } from "../components/TypedConfirmModal";

const ENV_COLOR: Record<Bucket["env"], string> = { dev: "#2fb36b", staging: "#f0a020", prod: "#e5484d" };

type Pending = { kind: "empty" | "delete"; bucket: Bucket } | null;

export function StoragePage() {
  const toast = useToast();
  const [items, setItems] = useState<Bucket[]>([]);
  const [pending, setPending] = useState<Pending>(null);

  const load = useCallback(async () => setItems(await api.listBuckets()), []);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(fn: () => Promise<unknown>, success: string) {
    try {
      await fn();
      toast("success", success);
    } catch (e) {
      toast("error", e instanceof ApiError ? e.body.message : "요청에 실패했습니다.");
    }
  }

  return (
    <section>
      <div className="page-header">
        <h1>Object Storage</h1>
        <div className="toolbar">
          {/* v1-pattern: icon-only-buttons */}
          <button className="icon-btn" onClick={() => void load()}>
            <RefreshIcon />
          </button>
        </div>
      </div>

      <table className="grid">
        <thead>
          <tr>
            <th />
            <th>버킷 이름</th>
            <th>공개 여부</th>
            <th>객체 수</th>
            <th>생성 일시</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map((b) => (
            <tr key={b.id}>
              <td>
                {/* v1-pattern: color-only-env */}
                <span className="env-dot" style={{ background: ENV_COLOR[b.env] }} />
              </td>
              <td className="name-cell">{b.name}</td>
              <td>
                {/* v1-pattern: div-controls — role/상태가 없는 토글. 누르는 즉시 공개 범위가 바뀐다(확인 없음). */}
                <div
                  className={b.public ? "switch on" : "switch"}
                  onClick={() =>
                    void act(async () => {
                      await api.setBucketPublic(b.id, !b.public);
                      await load();
                    }, "설정이 변경되었습니다.")
                  }
                >
                  <span className="switch-knob" />
                </div>
              </td>
              <td>{b.objectCount.toLocaleString()}</td>
              <td>{b.createdAt.slice(0, 10)}</td>
              <td className="actions-cell">
                <RowMenu
                  items={[
                    { label: "버킷 비우기", danger: true, onSelect: () => setPending({ kind: "empty", bucket: b }) },
                    { label: "버킷 삭제", danger: true, onSelect: () => setPending({ kind: "delete", bucket: b }) },
                  ]}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {pending && (
        <TypedConfirmModal
          title={pending.kind === "empty" ? "버킷 비우기" : "버킷 삭제"}
          description={
            pending.kind === "empty"
              ? "버킷의 모든 객체가 영구 삭제됩니다. 계속하려면 버킷 이름을 입력하세요."
              : "버킷이 삭제됩니다. 계속하려면 버킷 이름을 입력하세요."
          }
          expected={pending.bucket.name}
          onClose={() => setPending(null)}
          onConfirm={async () => {
            const { kind, bucket } = pending;
            await act(
              () => (kind === "empty" ? api.emptyBucket(bucket.id) : api.deleteBucket(bucket.id)),
              kind === "empty" ? "버킷을 비웠습니다." : "버킷을 삭제했습니다.",
            );
            setPending(null);
            // v1-pattern: stale-list — 객체 수/목록은 새로고침 전까지 그대로다.
          }}
        />
      )}
    </section>
  );
}
