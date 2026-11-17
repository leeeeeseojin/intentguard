import { useEffect, useId, useRef, useState } from "react";

export interface Action {
  label: string;
  danger?: boolean;
  /** 지금 할 수 없는 이유. 있으면 비활성화하고 이유를 함께 보여준다. */
  disabledReason?: string;
  onSelect: () => void;
}

/**
 * P1: 메뉴 버튼은 대상 이름을 포함한 접근성 이름을 가진다 ("api-server-dev 작업").
 * P8: 지금 할 수 없는 동작은 숨기지 않고 이유와 함께 비활성화한다.
 */
export function ActionMenu({ target, actions }: { target: string; actions: Action[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="row-menu" ref={ref}>
      <button className="btn btn-small" aria-haspopup="menu" aria-expanded={open} aria-controls={menuId} onClick={() => setOpen((v) => !v)}>
        {target} 작업 ▾
      </button>
      {open && (
        <div className="row-menu-list" role="menu" id={menuId} aria-label={`${target} 작업`}>
          {actions.map((a) => (
            <button
              key={a.label}
              role="menuitem"
              className={`row-menu-item${a.danger ? " danger" : ""}`}
              aria-disabled={!!a.disabledReason}
              title={a.disabledReason}
              onClick={() => {
                if (a.disabledReason) return;
                setOpen(false);
                a.onSelect();
              }}
            >
              {a.label}
              {a.disabledReason && <span className="menu-reason"> — {a.disabledReason}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
