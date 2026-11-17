import { useCallback, useEffect, useState } from "react";
import { api, type Bucket } from "../api";
import { ActionMenu } from "./ActionMenu";
import { ConfirmDialog } from "./ConfirmDialog";
import { ENV_LABEL } from "./labels";
import { useStatus } from "./StatusRegion";

type Pending = { kind: "empty" | "delete" | "public"; bucket: Bucket } | null;

export function StoragePageV2() {
  const { run } = useStatus();
  const [items, setItems] = useState<Bucket[]>([]);
  const [pending, setPending] = useState<Pending>(null);

  const load = useCallback(async () => setItems(await api.listBuckets()), []);
  useEffect(() => {
    void load();
  }, [load]);

  // P3: 모든 변경 뒤에 목록을 다시 불러와 화면과 실제 상태를 맞춘다.
  async function act(fn: () => Promise<unknown>, success: string) {
    await run(fn, success);
    await load();
  }

  return (
    <section aria-labelledby="storage-title">
      <div className="page-header">
        <div>
          <h1 id="storage-title">오브젝트 스토리지 (버킷)</h1>
          <p className="page-desc">파일(객체)을 저장하는 버킷 목록입니다.</p>
        </div>
        <div className="toolbar">
          <button className="btn" onClick={() => void load()}>
            목록 새로고침
          </button>
        </div>
      </div>

      <table className="grid" aria-label="버킷 목록">
        <thead>
          <tr>
            <th scope="col">버킷 이름</th>
            <th scope="col">환경</th>
            <th scope="col">외부 공개</th>
            <th scope="col">객체 수</th>
            <th scope="col">생성일</th>
            <th scope="col">작업</th>
          </tr>
        </thead>
        <tbody>
          {items.map((b) => (
            <tr key={b.id}>
              <th scope="row" className="name-cell">
                {b.name}
              </th>
              <td>
                <span className={`env-badge env-${b.env}`}>{ENV_LABEL[b.env]}</span>
              </td>
              <td>
                {/* P1·P2: 역할(switch)과 켜짐 상태(aria-checked), 그리고 텍스트 상태를 함께 노출한다. */}
                <button
                  role="switch"
                  aria-checked={b.public}
                  aria-label={`${b.name} 외부 공개`}
                  className={b.public ? "switch-v2 on" : "switch-v2"}
                  onClick={() =>
                    b.public
                      ? void act(() => api.setBucketPublic(b.id, false), `${b.name}을(를) 비공개로 바꿨습니다.`)
                      : setPending({ kind: "public", bucket: b })
                  }
                >
                  <span className="switch-knob" aria-hidden="true" />
                  <span className="switch-text">{b.public ? "공개" : "비공개"}</span>
                </button>
              </td>
              <td>{b.objectCount.toLocaleString()}개</td>
              <td>{b.createdAt.slice(0, 10)}</td>
              <td className="actions-cell">
                <ActionMenu
                  target={b.name}
                  actions={[
                    {
                      label: "버킷 비우기",
                      danger: true,
                      disabledReason: b.objectCount === 0 ? "이미 비어 있습니다" : undefined,
                      onSelect: () => setPending({ kind: "empty", bucket: b }),
                    },
                    {
                      label: "버킷 삭제",
                      danger: true,
                      disabledReason: b.objectCount > 0 ? `객체 ${b.objectCount.toLocaleString()}개가 남아 있어 먼저 비워야 합니다` : undefined,
                      onSelect: () => setPending({ kind: "delete", bucket: b }),
                    },
                  ]}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {pending && (
        <ConfirmDialog
          actionLabel={
            pending.kind === "empty" ? `${pending.bucket.name} 버킷 비우기` : pending.kind === "delete" ? `${pending.bucket.name} 버킷 삭제` : `${pending.bucket.name} 버킷 외부 공개`
          }
          targetName={pending.bucket.name}
          consequences={
            pending.kind === "empty"
              ? [`객체 ${pending.bucket.objectCount.toLocaleString()}개가 영구 삭제됩니다.`, "버킷 자체는 남습니다. 삭제하려면 비운 뒤 '버킷 삭제'를 하세요."]
              : pending.kind === "delete"
                ? ["빈 버킷이 삭제됩니다.", "삭제한 버킷은 복구할 수 없습니다."]
                : ["버킷의 모든 객체를 인터넷의 누구나 읽을 수 있게 됩니다."]
          }
          onClose={() => setPending(null)}
          onConfirm={async () => {
            const { kind, bucket } = pending;
            await act(
              () => (kind === "empty" ? api.emptyBucket(bucket.id) : kind === "delete" ? api.deleteBucket(bucket.id) : api.setBucketPublic(bucket.id, true)),
              kind === "empty" ? `${bucket.name}을(를) 비웠습니다. 이제 삭제할 수 있습니다.` : kind === "delete" ? `${bucket.name}을(를) 삭제했습니다.` : `${bucket.name}을(를) 공개로 바꿨습니다.`,
            );
            setPending(null);
          }}
        />
      )}
    </section>
  );
}
