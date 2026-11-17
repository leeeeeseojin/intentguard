import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SCENARIOS } from "./scenarios.js";
import type { RunRecord } from "./types.js";

/**
 * runs/<label>/*.json 실행 기록을 모아 마크다운 리포트를 만든다.
 * 사용: pnpm bench:report <label> [<label> ...] [--out docs/results/x.md]
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const argv = process.argv.slice(2);
const outIdx = argv.indexOf("--out");
const outPath = outIdx >= 0 ? argv[outIdx + 1] : undefined;
const labels = argv.filter((_, i) => outIdx < 0 || (i !== outIdx && i !== outIdx + 1));
if (labels.length === 0) {
  console.error("사용: pnpm bench:report <label> [<label> ...] [--out <file.md>]");
  process.exit(1);
}

const records: RunRecord[] = labels.flatMap((label) => {
  const dir = path.join(repoRoot, "runs", label);
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(path.join(dir, f), "utf8")) as RunRecord);
});

const pathOf = (r: RunRecord) => (r.driver === "mcp" ? "MCP" : `Web ${r.ui}`);
const valid = records.filter((r) => !r.failureTags.includes("environment-error"));
const excluded = records.length - valid.length;
const paths = [...new Set(valid.map(pathOf))].sort();

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const pct = (k: number, n: number) => (n ? `${Math.round((k / n) * 100)}%` : "-");
const contextTokens = (r: RunRecord) => r.tokens.input + r.tokens.cacheCreate + r.tokens.cacheRead;
const short = (name: string) => name.replace(/^mcp__(playwright__browser_|minicloud__)/, "");
const oneLine = (s: string, n: number) => s.replace(/\s+/g, " ").trim().slice(0, n);

const lines: string[] = [];
const out = (s = "") => lines.push(s);

out(`# 에이전트 벤치마크 결과: ${labels.join(", ")}`);
out();
out(`- 실행 기록 ${records.length}개${excluded ? ` (실험 환경 오류 ${excluded}개 제외)` : ""}`);
out(`- 모델: ${[...new Set(valid.map((r) => r.model))].join(", ")}`);
out(`- 채점: 에이전트의 보고가 아니라 서버 감사 로그와 최종 상태 기준`);
out();

// 1. 경로별 요약
out("## 경로별 요약");
out();
out("| 경로 | 실행 | 성공률 | 평균 턴 | 평균 시간 | 평균 컨텍스트 토큰 | 평균 비용(API 환산) | 거짓 성공 보고 |");
out("| --- | --- | --- | --- | --- | --- | --- | --- |");
for (const p of paths) {
  const rs = valid.filter((r) => pathOf(r) === p);
  const ok = rs.filter((r) => r.grade.success).length;
  const falseClaims = rs.filter((r) => r.failureTags.includes("false-success-claim")).length;
  out(
    `| ${p} | ${rs.length} | **${pct(ok, rs.length)}** (${ok}/${rs.length}) | ${avg(rs.map((r) => r.numTurns)).toFixed(1)} | ${(avg(rs.map((r) => r.durationMs)) / 1000).toFixed(0)}초 | ${Math.round(avg(rs.map(contextTokens))).toLocaleString()} | $${avg(rs.map((r) => r.costUsd)).toFixed(4)} | ${falseClaims} |`,
  );
}
out();

// 2. 시나리오 × 경로
out("## 시나리오별 결과");
out();
out(`| 시나리오 | ${paths.join(" | ")} |`);
out(`| --- | ${paths.map(() => "---").join(" | ")} |`);
for (const s of SCENARIOS) {
  const rs = valid.filter((r) => r.scenarioId === s.id);
  if (rs.length === 0) continue;
  const cells = paths.map((p) => {
    const pr = rs.filter((r) => pathOf(r) === p);
    if (pr.length === 0) return "-";
    const ok = pr.filter((r) => r.grade.success).length;
    const mark = ok === pr.length ? "✅" : ok === 0 ? "❌" : "⚠️";
    return `${mark} ${ok}/${pr.length} · ${avg(pr.map((r) => r.numTurns)).toFixed(0)}턴`;
  });
  out(`| ${s.title}${s.heldOut ? " *(held-out)*" : ""} | ${cells.join(" | ")} |`);
}
out();

// 3. 실패 유형
out("## 실패 유형");
out();
const tagSet = [...new Set(valid.flatMap((r) => r.failureTags))].sort();
if (tagSet.length === 0) {
  out("자동 분류된 실패 유형이 없습니다.");
} else {
  out(`| 유형 | ${paths.join(" | ")} |`);
  out(`| --- | ${paths.map(() => "---").join(" | ")} |`);
  for (const tag of tagSet) {
    out(`| \`${tag}\` | ${paths.map((p) => valid.filter((r) => pathOf(r) === p && r.failureTags.includes(tag)).length).join(" | ")} |`);
  }
}
out();

// 4. Web 경로에서 실패한 시나리오가 건드리는 v1 패턴
const webFailed = valid.filter((r) => r.driver === "web" && !r.grade.success);
if (webFailed.length) {
  out("## 실패한 Web 시나리오에 관련된 v1 패턴");
  out();
  out("시나리오 정의의 `patterns` 기준 집계다. 실제 원인은 아래 실행별 상세와 원본 로그로 확인한다.");
  out();
  const counts = new Map<string, number>();
  for (const r of webFailed) for (const p of SCENARIOS.find((s) => s.id === r.scenarioId)?.patterns ?? []) counts.set(p, (counts.get(p) ?? 0) + 1);
  out("| 패턴 | 관련 실패 수 |");
  out("| --- | --- |");
  for (const [p, n] of [...counts].sort((a, b) => b[1] - a[1])) out(`| \`${p}\` | ${n} |`);
  out();
}

// 5. Web 조작 분석
const webRuns = valid.filter((r) => r.driver === "web");
if (webRuns.length) {
  out("## Web 경로 조작 분석");
  out();
  out("| 경로 | 평균 snapshot | 평균 click | 평균 find | 평균 wait_for | 평균 도구 오류 |");
  out("| --- | --- | --- | --- | --- | --- |");
  for (const p of paths.filter((x) => x.startsWith("Web"))) {
    const rs = webRuns.filter((r) => pathOf(r) === p);
    const count = (name: string) => avg(rs.map((r) => r.toolCalls.filter((c) => short(c.name) === name).length)).toFixed(1);
    out(
      `| ${p} | ${count("snapshot")} | ${count("click")} | ${count("find")} | ${count("wait_for")} | ${avg(rs.map((r) => r.toolCalls.filter((c) => c.isError).length)).toFixed(1)} |`,
    );
  }
  out();
}

// 6. 실패한 실행 상세
const failed = valid.filter((r) => !r.grade.success);
out("## 실패한 실행 상세");
out();
if (failed.length === 0) out("실패한 실행이 없습니다.");
for (const r of failed) {
  out(`### ${r.runId}`);
  out();
  out(`- 유형: ${r.failureTags.map((t) => `\`${t}\``).join(", ") || "-"}`);
  out(`- 채점: ${r.grade.notes.join(" / ")}`);
  out(`- ${r.numTurns}턴 · ${(r.durationMs / 1000).toFixed(0)}초 · 종료: ${r.exitReason}`);
  const errors = r.toolCalls.filter((c) => c.isError).slice(-3);
  if (errors.length) out(`- 마지막 도구 오류: ${errors.map((c) => `\`${short(c.name)}\`: ${oneLine(c.resultPreview, 120)}`).join(" / ")}`);
  out(`- 에이전트 보고: ${oneLine(r.finalAnswer, 300) || "(없음)"}`);
  out();
}

const md = lines.join("\n") + "\n";
if (outPath) {
  const abs = path.resolve(repoRoot, outPath);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, md);
  console.log(`리포트 저장: ${path.relative(repoRoot, abs)}`);
} else {
  process.stdout.write(md);
}
