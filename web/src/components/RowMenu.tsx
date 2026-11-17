import { useEffect, useRef, useState } from "react";
import { MoreIcon } from "./icons";

export interface RowMenuItem {
  label: string;
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

/** v1-pattern: overflow-menu — 행 동작이 이름 없는 ⋮ 버튼 뒤에 숨어 있다. */
export function RowMenu({ items }: { items: RowMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div className="row-menu" ref={ref}>
      <button className="icon-btn ghost" onClick={() => setOpen((v) => !v)}>
        <MoreIcon />
      </button>
      {open && (
        <div className="row-menu-list">
          {items.map((item) => (
            <div
              key={item.label}
              className={`row-menu-item${item.danger ? " danger" : ""}${item.disabled ? " disabled" : ""}`}
              onClick={() => {
                if (item.disabled) return;
                setOpen(false);
                item.onSelect();
              }}
            >
              {item.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
