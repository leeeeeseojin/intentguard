import { useCallback, useEffect, useState } from "react";

/** P5: 필터·검색 상태를 URL(#/server?q=api&env=dev)에 둔다. 링크로 공유되고 새로고침해도 유지된다. */
export function useHashParams(): [URLSearchParams, (next: Record<string, string>) => void] {
  const read = () => new URLSearchParams(location.hash.split("?")[1] ?? "");
  const [params, setParams] = useState(read);

  useEffect(() => {
    const onHash = () => setParams(read());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const update = useCallback((next: Record<string, string>) => {
    const [path] = location.hash.split("?");
    const merged = read();
    for (const [k, v] of Object.entries(next)) {
      if (v) merged.set(k, v);
      else merged.delete(k);
    }
    const qs = merged.toString();
    history.replaceState(null, "", `${location.pathname}${location.search}${path || "#/server"}${qs ? `?${qs}` : ""}`);
    setParams(merged);
  }, []);

  return [params, update];
}
