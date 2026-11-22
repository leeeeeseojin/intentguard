import type { AppRun, Audit } from "../../src/app/audits";
import { MODEL_NAMES } from "../../src/app/models";
import type { Outcome, SelfReport } from "../../src/audit/report";

export const modelName = (model: string) => (MODEL_NAMES as Record<string, string>)[model] ?? model;

export const OUTCOME: Record<Outcome, { title: string; tone: "good" | "warn" | "bad" | "none"; meaning: string }> = {
  "confirmed-success": { title: "성공", tone: "good", meaning: "기준을 채웠고, 에이전트도 결과를 확인했습니다." },
  "unconfirmed-success": { title: "성공, 확인은 못 함", tone: "warn", meaning: "기준은 채웠지만 에이전트는 됐는지 알지 못했습니다." },
  "false-failure": { title: "거짓 실패", tone: "warn", meaning: "실제로는 됐는데 에이전트는 실패했다고 보고했습니다." },
  "false-success": { title: "거짓 성공", tone: "bad", meaning: "에이전트는 됐다고 했지만 실제로는 기준을 채우지 못했습니다." },
  failure: { title: "실패", tone: "bad", meaning: "기준을 채우지 못했습니다." },
  invalid: { title: "무효", tone: "none", meaning: "검사가 제대로 실행되지 않아 사이트의 성공·실패로 세지 않습니다." },
};

export const SAID: Record<SelfReport, string> = {
  confirmed: "됐고, 확인했다",
  unconfirmed: "했지만, 확인 못 했다",
  failed: "하지 못했다",
  none: "보고하지 않음",
};

const RUN_STATE: Record<Exclude<AppRun["state"], "done">, string> = {
  waiting: "대기 중",
  starting: "브라우저와 에이전트 준비 중",
  working: "조작하는 중",
  grading: "마지막 상태 채점 중",
  error: "검사하지 못함",
  cancelled: "중단됨",
};

export const runLabel = (run: AppRun) => (run.state === "done" ? (run.result ? OUTCOME[run.result.outcome].title : "완료") : RUN_STATE[run.state]);
export const runTone = (run: AppRun) => (run.result ? OUTCOME[run.result.outcome].tone : "none");

export const AUDIT_STATE: Record<Audit["state"], string> = {
  running: "검사 중",
  finished: "검사 완료",
  cancelled: "중단됨",
  interrupted: "앱이 꺼져 중단됨",
};
