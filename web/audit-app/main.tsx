import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "../src/tokens.css";
import "../src/base.css";
import "./app.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
