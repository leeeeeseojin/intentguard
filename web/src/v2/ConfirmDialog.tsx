import { useId, useState } from "react";
import { Dialog } from "./Dialog";

interface Props {
  /** 동작+대상, 예: "api-server-dev 서버 삭제" */
  actionLabel: string;
  consequences: string[];
  targetName: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

/**
 * P7: 되돌릴 수 없는 작업은 대상과 결과를 말한다.
 * 확인 버튼 이름이 "확인"이 아니라 실제 동작+대상이고, 입력란에는 무엇을 입력하는지 라벨이 있다.
 */
export function ConfirmDialog({ actionLabel, consequences, targetName, onConfirm, onClose }: Props) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const inputId = useId();
  const matches = value === targetName;

  return (
    <Dialog
      title={actionLabel}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            취소
          </button>
          <button
            className="btn btn-danger"
            disabled={!matches || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
              } finally {
                setBusy(false);
              }
            }}
          >
            {actionLabel}
          </button>
        </>
      }
    >
      <ul className="consequences">
        {consequences.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <label className="field" htmlFor={inputId}>
        <span className="field-label">확인을 위해 이름 {targetName} 을(를) 입력하세요</span>
        <input id={inputId} className="input full" value={value} onChange={(e) => setValue(e.target.value)} />
      </label>
      {!matches && value.length > 0 && <p className="field-error">입력한 이름이 {targetName}와(과) 다릅니다.</p>}
    </Dialog>
  );
}
