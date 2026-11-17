import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { ApiError, isPending } from "../api";

export interface StatusMessage {
  kind: "success" | "error" | "pending";
  title: string;
  detail?: string;
  /** 다음에 무엇을 하면 되는지 (서버 hint) */
  hint?: string;
}

interface StatusApi {
  status: StatusMessage | null;
  set: (msg: StatusMessage | null) => void;
  /** 변경 요청을 실행하고 결과를 상태 영역에 남긴다. 성공 여부를 돌려준다. */
  run: (fn: () => Promise<unknown>, success: string) => Promise<boolean>;
}

const StatusContext = createContext<StatusApi>({ status: null, set: () => {}, run: async () => false });

export const useStatus = () => useContext(StatusContext);

export function StatusProvider({ children }: { children: ReactNode }) {
  const [status, set] = useState<StatusMessage | null>(null);

  const run = useCallback(async (fn: () => Promise<unknown>, success: string) => {
    try {
      const result = await fn();
      if (isPending(result)) {
        set({
          kind: "pending",
          title: `사람 승인 대기 중: ${result.approval.risk.summary}`,
          detail: `위험 요인: ${result.approval.risk.reasons.join(", ")}. 승인 요청 ${result.approval.id}`,
          hint: "오른쪽 IntentGuard 패널에서 사람이 승인하면 실행됩니다. 같은 작업을 다시 요청하지 마세요.",
        });
        return false;
      }
      set({ kind: "success", title: success });
      return true;
    } catch (e) {
      if (e instanceof ApiError) set({ kind: "error", title: e.body.message, hint: e.body.hint, detail: `오류 코드: ${e.body.code}` });
      else set({ kind: "error", title: "요청에 실패했습니다." });
      return false;
    }
  }, []);

  return <StatusContext.Provider value={{ status, set, run }}>{children}</StatusContext.Provider>;
}

const LABEL: Record<StatusMessage["kind"], string> = { success: "완료", error: "오류", pending: "승인 대기" };

/**
 * P4: 결과 메시지는 사라지지 않고, 다음 행동을 알려준다.
 * 다음 작업을 하거나 닫기 전까지 남아 있어 사람과 에이전트 모두 언제든 다시 읽을 수 있다.
 */
export function StatusRegion() {
  const { status, set } = useStatus();
  return (
    <div className="status-region" role={status?.kind === "error" ? "alert" : "status"} aria-live="polite" aria-label="최근 작업 결과">
      {status && (
        <div className={`status-msg status-msg-${status.kind}`}>
          <div className="status-msg-body">
            <strong>
              [{LABEL[status.kind]}] {status.title}
            </strong>
            {status.detail && <div>{status.detail}</div>}
            {status.hint && <div className="status-hint">다음 행동: {status.hint}</div>}
          </div>
          <button className="btn btn-small" onClick={() => set(null)}>
            결과 메시지 닫기
          </button>
        </div>
      )}
    </div>
  );
}
