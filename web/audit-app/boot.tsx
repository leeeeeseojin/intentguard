import type { ReactNode } from "react";
import { bootDemo } from "../src/demo/boot";
import { App } from "./App";
import "./app.css";

/** 검사 앱: 배포본과 같은 홈에 검사 화면을 더한다. v1·v2 체험도 그대로 열린다. */
export function bootApp(ui: "v1" | "v2", renderConsole: () => ReactNode): ReactNode {
  if (new URLSearchParams(location.search).has("ui")) return bootDemo(ui, renderConsole);
  document.title = "IntentGuard · 검사 앱";
  return <App />;
}
