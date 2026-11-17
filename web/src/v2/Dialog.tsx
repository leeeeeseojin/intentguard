import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface DialogProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
  width?: number;
}

/**
 * v1 모달은 열려 있어도 배경 버튼이 접근성 트리에 남아 "생성" 버튼이 두 개로 잡혔다.
 * v2는 role="dialog" + aria-modal과 배경 inert로 대화상자 안의 요소만 노출한다.
 */
export function Dialog({ title, onClose, children, footer, width = 520 }: DialogProps) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".console");
    root?.setAttribute("inert", "");
    ref.current?.querySelector<HTMLElement>("input, select, button")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      root?.removeAttribute("inert");
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // 배경(.console)을 inert로 만들기 때문에 대화상자는 body에 portal로 렌더링한다.
  return createPortal(
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId} style={{ width }} ref={ref}>
        <div className="modal-header">
          <h2 className="modal-title" id={titleId}>
            {title}
          </h2>
          <button className="btn btn-small" onClick={onClose}>
            닫기
          </button>
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-footer">{footer}</div>
      </div>
    </div>,
    document.body,
  );
}
