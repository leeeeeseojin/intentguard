import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { summarize } from "../src/bench/summary.js";

it("공개 데모의 수치가 커밋된 비교 리포트와 같다", () => {
  const { totalRuns, paths } = summarize(".");
  const report = readFileSync("docs/results/final-comparison.md", "utf8");
  expect(totalRuns).toBe(90);

  for (const [key, name] of [["mcp", "MCP"], ["v1", "Web v1"], ["v2", "Web v2"]] as const) {
    const p = paths[key];
    const row = report.split("\n").find((line) => line.startsWith(`| ${name} | ${p.runs} |`));
    expect(row).toContain(`(${p.success}/${p.runs})`);
    expect(row).toContain(`(${p.verified}/${p.runs}) | ${p.turns.toFixed(1)} | ${p.seconds.toFixed(0)}초 | ${Math.round(p.tokens).toLocaleString()}`);
  }
});
