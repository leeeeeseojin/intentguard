import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

interface ToastItem {
  id: number;
  kind: "success" | "error";
  text: string;
}

const ToastContext = createContext<(kind: ToastItem["kind"], text: string) => void>(() => {});

export const useToast = () => useContext(ToastContext);

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const show = useCallback((kind: ToastItem["kind"], text: string) => {
    const id = nextId++;
    setItems((prev) => [...prev, { id, kind, text }]);
    // v1-pattern: vanishing-toast — 오류도 2.5초 뒤 사라지고, 원인 해결 방법(hint)은 보여주지 않는다.
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 2500);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toast-stack">
        {items.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
