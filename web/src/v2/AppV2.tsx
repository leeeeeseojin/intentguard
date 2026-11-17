import { useEffect, useState } from "react";
import { AgentPanel } from "./AgentPanel";
import { SecurityGroupsPageV2 } from "./SecurityGroupsPageV2";
import { ServersPageV2 } from "./ServersPageV2";
import { StatusProvider, StatusRegion } from "./StatusRegion";
import { StoragePageV2 } from "./StoragePageV2";

type Route = "server" | "storage" | "acg";

// v1의 서비스 용어(Server, Object Storage, ACG)를 설명이 붙은 한국어 메뉴로 바꿨다.
const NAV: { route: Route; label: string }[] = [
  { route: "server", label: "서버" },
  { route: "storage", label: "오브젝트 스토리지 (버킷)" },
  { route: "acg", label: "보안 그룹 (ACG)" },
];

function currentRoute(): Route {
  const path = location.hash.replace("#/", "").split("?")[0];
  return NAV.some((n) => n.route === path) ? (path as Route) : "server";
}

export function AppV2() {
  const [route, setRoute] = useState<Route>(currentRoute);

  useEffect(() => {
    const onHash = () => setRoute(currentRoute());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  return (
    <StatusProvider>
      <div className="console console-v2">
        <header className="topbar">
          <span className="brand">MiniCloud</span>
          <span className="region">리전: 한국</span>
          <span className="topbar-spacer" />
          <span className="account">콘솔 v2 · admin@minicloud</span>
        </header>
        <nav className="sidebar" aria-label="서비스 메뉴">
          {NAV.map((n) => (
            <a key={n.route} href={`#/${n.route}`} className={route === n.route ? "nav-item active" : "nav-item"} aria-current={route === n.route ? "page" : undefined}>
              {n.label}
            </a>
          ))}
        </nav>
        <main className="content">
          <StatusRegion />
          {route === "server" && <ServersPageV2 />}
          {route === "storage" && <StoragePageV2 />}
          {route === "acg" && <SecurityGroupsPageV2 />}
        </main>
        <AgentPanel />
      </div>
    </StatusProvider>
  );
}
