import "./zodConfig";
import type { ReactNode } from "react";
import { currentActor } from "../api";
import { startDemoBackend } from "./backend";
import { DemoBar } from "./DemoBar";
import { Landing } from "./Landing";

/** 공개 데모: ui 파라미터가 없으면 소개 화면, 있으면 브라우저 안 API에 연결된 콘솔. */
export function bootDemo(ui: "v1" | "v2", renderConsole: () => ReactNode): ReactNode {
  if (!new URLSearchParams(location.search).has("ui")) {
    document.title = "IntentGuard · AI 에이전트 UX 검사기";
    return <Landing />;
  }
  const request = startDemoBackend();
  return (
    <>
      {currentActor === "human" && <DemoBar ui={ui} request={request} />}
      {renderConsole()}
    </>
  );
}
