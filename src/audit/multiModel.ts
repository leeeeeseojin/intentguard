import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { GradeResult } from "../bench/types.js";
import { redact } from "./publish.js";
import { judge, type AuditRecord, type Outcome } from "./report.js";

/**
 * 멀티 모델 교차 검증의 실행 기록을 공개용 결과와 README 표로 만든다.
 *   pnpm exec tsx src/audit/multiModel.ts .intentguard/bench80 80
 * 끝나지 않은 상태에서 돌리면 중간 집계로 표시된다. 측정하지 않은 값은 채우지 않는다.
 */

export interface CrossRun {
  task: string;
  ui: "v1" | "v2";
  model: string;
  outcome: Outcome;
  notes: GradeResult["notes"];
  answer: string;
}

export interface CrossResult {
  planned: number;
  valid: number;
  /** 한도·실행 오류로 통계에서 뺀 실행 */
  invalid: number;
  runs: CrossRun[];
}

export interface CrossRow {
  model: string;
  pairs: number;
  v1: number;
  v2: number;
}

/** v1과 v2가 모두 끝난 같은 모델·같은 과제만 비교한다. */
export function comparePairs(runs: CrossRun[]): { total: CrossRow; models: CrossRow[] } {
  const row = (model: string, selected: CrossRun[]): CrossRow => {
    const result = { model, pairs: 0, v1: 0, v2: 0 };
    for (const before of selected.filter((r) => r.ui === "v1")) {
      const after = selected.find((r) => r.ui === "v2" && r.task === before.task && r.model === before.model);
      if (!after) continue;
      result.pairs++;
      if (before.outcome === "confirmed-success") result.v1++;
      if (after.outcome === "confirmed-success") result.v2++;
    }
    return result;
  };
  const models = [...new Set(runs.map((r) => r.model))].sort();
  return { total: row("전체", runs), models: models.map((model) => row(model, runs.filter((r) => r.model === model))) };
}

export const percent = (count: number, of: number) => (of ? `${Math.round((count / of) * 100)}%` : "-");

export function toReadme(result: CrossResult): string {
  const { total, models } = comparePairs(result.runs);
  const done = result.valid >= result.planned;
  const cells = (r: CrossRow) => `${r.pairs} | ${percent(r.v1, r.pairs)} (${r.v1}/${r.pairs}) | **${percent(r.v2, r.pairs)}** (${r.v2}/${r.pairs})`;
  return [
    done
      ? `**4개 모델 교차 검증 · ${result.valid}회 완료**`
      : `**4개 모델 교차 검증 · 중간 집계 (유효 ${result.valid}/${result.planned}회, 나머지 측정 중)**`,
    "",
    "| 모델 | 비교한 쌍 | v1 확인된 성공 | v2 확인된 성공 |",
    "| --- | --- | --- | --- |",
    `| **전체** | ${cells(total)} |`,
    ...models.map((m) => `| ${m.model} | ${cells(m)} |`),
  ].join("\n");
}

function readRecords(dir: string): AuditRecord[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return readRecords(file);
    return entry.name.endsWith(".json") ? [JSON.parse(readFileSync(file, "utf8")) as AuditRecord] : [];
  });
}

const START = "<!-- multi-model:start -->";
const END = "<!-- multi-model:end -->";

function publish(source: string, planned: number) {
  const runs = new Map<string, CrossRun>();
  let invalid = 0;
  for (const record of readRecords(source).sort((a, b) => a.startedAt.localeCompare(b.startedAt))) {
    const outcome = judge(record.grade, record.agent);
    if (outcome === "invalid") {
      invalid++;
      continue;
    }
    const ui = new URL(record.target).searchParams.get("ui") === "v2" ? "v2" : "v1";
    const key = `${record.id} ${ui} ${record.model}`;
    if (runs.has(key)) continue; // 첫 유효 실행만 센다. 실패를 다시 돌려 덮어쓰지 못하게.
    runs.set(key, {
      task: record.id,
      ui,
      model: record.model,
      outcome,
      notes: record.grade.notes.map((note) => redact(note)),
      answer: redact(record.agent.answer).slice(0, 900),
    });
  }
  if (!runs.size) throw new Error(`유효한 기록이 없습니다: ${source}`);

  const sorted = [...runs.values()].sort((a, b) => `${a.model} ${a.task} ${a.ui}`.localeCompare(`${b.model} ${b.task} ${b.ui}`));
  const result: CrossResult = { planned, valid: sorted.length, invalid, runs: sorted };
  writeFileSync("docs/results/multi-model.json", `${JSON.stringify(result, null, 2)}\n`);

  const readme = readFileSync("README.md", "utf8");
  const from = readme.indexOf(START);
  const to = readme.indexOf(END);
  if (from < 0 || to < from) throw new Error("README에 multi-model 표시가 없습니다.");
  writeFileSync("README.md", `${readme.slice(0, from + START.length)}\n${toReadme(result)}\n${readme.slice(to)}`);
  console.log(toReadme(result));
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("src/audit/multiModel.ts")) {
  publish(process.argv[2] ?? ".intentguard/bench80", Number(process.argv[3] ?? 80));
}
