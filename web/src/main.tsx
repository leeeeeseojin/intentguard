import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { AppV2 } from "./v2/AppV2";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./tokens.css";
import "./base.css";
import "./styles.css";
import "./controls.css";
import "./console-theme.css";
import "./v2/styles-v2.css";

// ?ui=v2 로 개선된 콘솔을 연다. 기본값은 v1 (실험 기준선).
const ui = new URLSearchParams(location.search).get("ui") === "v2" ? "v2" : "v1";
document.title = ui === "v2" ? "MiniCloud Console v2" : "MiniCloud Console";

const renderConsole = () => (ui === "v2" ? <AppV2 /> : <App />);
const render = (node: ReactNode) => createRoot(document.getElementById("root")!).render(<StrictMode>{node}</StrictMode>);

// demo 모드로 빌드할 때만 브라우저 안 API와 소개 화면이 번들에 들어간다.
if (import.meta.env.MODE === "demo") void import("./demo/boot").then(({ bootDemo }) => render(bootDemo(ui, renderConsole)));
else render(renderConsole());
