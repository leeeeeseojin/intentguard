import { readFileSync } from "node:fs";

export interface VerificationLabels {
  criteria: string;
  reviewer: string;
  /** 실행 묶음 이름 → 검수 결과. unverified에 없는 실행은 확인된 것으로 본다. */
  labels: Record<string, { reviewed: number; unverified: Record<string, string> }>;
}

export function loadVerificationLabels(file: string): VerificationLabels {
  return JSON.parse(readFileSync(file, "utf8")) as VerificationLabels;
}

/** 정규식 1차 분류 중 "확인 여부"만 답변을 읽고 검수한 결과로 바꾼다. */
export function applyReview(tags: string[], runId: string, review?: { unverified: Record<string, string> }): string[] {
  if (!review) return tags;
  const rest = tags.filter((t) => t !== "unverified-success");
  return runId in review.unverified ? [...rest, "unverified-success"] : rest;
}
