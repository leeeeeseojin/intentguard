import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { classify } from "./classify.js";
import { SCENARIOS } from "./scenarios.js";
import type { RunRecord } from "./types.js";
import { applyReview, loadVerificationLabels } from "./verification.js";

/** 공개 리포트에 쓰는 실행 묶음. */
export const PUBLISHED_RUNS = ["final-mcp-v1", "final-v2"];

export interface PathSummary {
  runs: number;
  success: number;
  verified: number;
  turns: number;
  seconds: number;
  tokens: number;
}

export type PathKey = "mcp" | "v1" | "v2";

export interface BenchSummary {
  totalRuns: number;
  model: string;
  paths: Record<PathKey, PathSummary>;
  scenarios: { id: string; title: string; prompt: string; paths: Record<PathKey, PathSummary> }[];
}

/** 공개 데모의 수치는 손으로 옮기지 않고 빌드할 때 실행 기록과 검수 라벨에서 계산한다. */
export function summarize(root: string, labels = PUBLISHED_RUNS): BenchSummary {
  const reviews = loadVerificationLabels(path.join(root, "docs/results/verification-labels.json"));
  const rows = labels.flatMap((label) =>
    readdirSync(path.join(root, "runs", label))
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        const run = JSON.parse(readFileSync(path.join(root, "runs", label, f), "utf8")) as RunRecord;
        const tags = applyReview(classify(run, run.permissionDenials ?? 0), run.runId, reviews.labels[label]);
        const key: PathKey = run.driver === "mcp" ? "mcp" : run.ui === "v2" ? "v2" : "v1";
        return { run, key, verified: run.grade.success && !tags.includes("unverified-success") };
      }),
  );

  const byPath = (selected: typeof rows) => {
    const summary = (key: PathKey): PathSummary => {
      const rs = selected.filter((r) => r.key === key);
      const avg = (value: (r: RunRecord) => number) => (rs.length ? rs.reduce((sum, r) => sum + value(r.run), 0) / rs.length : 0);
      return {
        runs: rs.length,
        success: rs.filter((r) => r.run.grade.success).length,
        verified: rs.filter((r) => r.verified).length,
        turns: avg((r) => r.numTurns),
        seconds: avg((r) => r.durationMs) / 1000,
        tokens: avg((r) => r.tokens.input + r.tokens.cacheCreate + r.tokens.cacheRead),
      };
    };
    return { mcp: summary("mcp"), v1: summary("v1"), v2: summary("v2") };
  };

  return {
    totalRuns: rows.length,
    model: [...new Set(rows.map((r) => r.run.model))].join(", "),
    paths: byPath(rows),
    scenarios: SCENARIOS.map(({ id, title, prompt }) => ({ id, title, prompt, paths: byPath(rows.filter((r) => r.run.scenarioId === id)) })),
  };
}
