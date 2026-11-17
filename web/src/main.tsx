import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { AppV2 } from "./v2/AppV2";
import "./styles.css";
import "./v2/styles-v2.css";

// ?ui=v2 로 개선된 콘솔을 연다. 기본값은 v1 (실험 기준선).
const ui = new URLSearchParams(location.search).get("ui") === "v2" ? "v2" : "v1";
document.title = ui === "v2" ? "MiniCloud Console v2" : "MiniCloud Console";

createRoot(document.getElementById("root")!).render(<StrictMode>{ui === "v2" ? <AppV2 /> : <App />}</StrictMode>);
