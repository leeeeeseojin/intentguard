import { useEffect } from "react";

/** 서버 상태가 이 화면 밖에서 바뀌었음을 알리는 이벤트 (승인 실행, 다른 탭의 변경 등) */
export const CLOUD_CHANGED = "minicloud:changed";

export function useCloudChanged(onChange: () => void) {
  useEffect(() => {
    window.addEventListener(CLOUD_CHANGED, onChange);
    return () => window.removeEventListener(CLOUD_CHANGED, onChange);
  }, [onChange]);
}
