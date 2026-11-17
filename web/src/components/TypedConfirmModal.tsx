import { useState } from "react";
import { Modal } from "./Modal";

interface Props {
  title: string;
  description: string;
  expected: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

/** v1-pattern: typed-confirmation — 리소스 이름을 정확히 입력해야 '확인'이 활성화된다. 버튼 이름은 무엇을 하는지 말하지 않는다. */
export function TypedConfirmModal({ title, description, expected, onConfirm, onClose }: Props) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            취소
          </button>
          <button className="btn btn-danger" disabled={value !== expected || busy} onClick={() => void confirm()}>
            확인
          </button>
        </>
      }
    >
      <p className="confirm-desc">{description}</p>
      <input className="input full" value={value} onChange={(e) => setValue(e.target.value)} />
    </Modal>
  );
}
