import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { comparePairs, toReadme, type CrossResult, type CrossRun } from "../src/audit/multiModel.js";

const run = (task: string, ui: "v1" | "v2", outcome: CrossRun["outcome"]): CrossRun => ({ task, ui, model: "m", outcome, notes: [], answer: "" });

describe("멀티 모델 교차 검증", () => {
  it("짝이 맞지 않는 실행은 비교에서 뺀다", () => {
    const runs = [run("a", "v1", "failure"), run("a", "v2", "confirmed-success"), run("b", "v2", "confirmed-success")];
    expect(comparePairs(runs).total).toEqual({ model: "전체", pairs: 1, v1: 0, v2: 1 });
  });

  it("README의 표는 공개한 실행 기록에서 계산한 값과 같다", () => {
    const result = JSON.parse(readFileSync("docs/results/multi-model.json", "utf8")) as CrossResult;
    expect(result.runs).toHaveLength(result.valid);
    expect(new Set(result.runs.map((r) => `${r.task} ${r.ui} ${r.model}`)).size).toBe(result.valid);
    expect(readFileSync("README.md", "utf8").replaceAll("\r\n", "\n")).toContain(toReadme(result));
  });
});
