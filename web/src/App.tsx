import { useEffect, useState } from "react";
import { ToastProvider } from "./components/Toast";
import { BucketIcon, ServerIcon, ShieldIcon } from "./components/icons";
import { AcgPage } from "./pages/AcgPage";
import { ServersPage } from "./pages/ServersPage";
import { StoragePage } from "./pages/StoragePage";

type Route = "server" | "storage" | "acg";

const NAV: { route: Route; label: string; group: string; icon: () => React.JSX.Element }[] = [
  // v1-pattern: jargon-labels — 실제 콘솔처럼 서비스 용어(Server, Object Storage, ACG)를 그대로 메뉴명으로 쓴다.
  { route: "server", label: "Server", group: "Compute", icon: ServerIcon },
  { route: "storage", label: "Object Storage", group: "Storage", icon: BucketIcon },
  { route: "acg", label: "ACG", group: "Networking", icon: ShieldIcon },
];

function currentRoute(): Route {
  const hash = location.hash.replace("#/", "");
  return NAV.some((n) => n.route === hash) ? (hash as Route) : "server";
}

export function App() {
  const [route, setRoute] = useState<Route>(currentRoute);

  useEffect(() => {
    const onHash = () => setRoute(currentRoute());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  return (
    <ToastProvider>
      <div className="console">
        <header className="topbar">
          <span className="brand">MiniCloud</span>
          <span className="region">Region: KOREA</span>
          <span className="topbar-spacer" />
          <span className="account">admin@minicloud</span>
        </header>
        <nav className="sidebar">
          {["Compute", "Storage", "Networking"].map((group) => (
            <div key={group} className="nav-group">
              <div className="nav-group-title">{group}</div>
              {NAV.filter((n) => n.group === group).map((n) => (
                <a key={n.route} href={`#/${n.route}`} className={route === n.route ? "nav-item active" : "nav-item"}>
                  <n.icon />
                  {n.label}
                </a>
              ))}
            </div>
          ))}
        </nav>
        <main className="content">
          {route === "server" && <ServersPage />}
          {route === "storage" && <StoragePage />}
          {route === "acg" && <AcgPage />}
        </main>
      </div>
    </ToastProvider>
  );
}
