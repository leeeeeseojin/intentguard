import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { describeCheck, specSchema } from "./grade.js";
import os from "node:os";
import path from "node:path";
import { findIssues, judge, type AuditRecord, type Outcome } from "./report.js";

/**
 * 검사 기록을 사이트에 공개할 형태로 바꾼다.
 *   pnpm exec tsx src/audit/publish.ts .intentguard/live
 * 폴더 안의 기록을 골라내지 않고 실패·무효까지 전부 싣는다. 로컬 경로, 실행 시각, 도구 원본 출력은 싣지 않는다.
 */

export interface PublishedRun {
  model: string;
  outcome: Outcome;
  seconds: number;
  notes: string[];
  answer: string;
  issues: { kind: string; count: number; fix: string; evidence: string }[];
  /** 에이전트가 브라우저에서 한 조작 순서 */
  actions: { tool: string; detail: string; failed: boolean }[];
  screenshot: string | null;
}

export interface PublishedTask {
  url: string;
  task: string;
  criteria: string[];
  runs: PublishedRun[];
}

/** 홈 폴더 경로에는 사용자 이름이 들어 있으므로 지운다. */
export function redact(text: string, home = os.homedir()): string {
  const slashes = home.replaceAll("\\", "/");
  return text
    .replaceAll(home, "~")
    .replaceAll(slashes, "~")
    .replace(/[A-Za-z]:[\\/](?:Users|FE Project)[\\/][^\s`"')]+/g, "(로컬 경로)");
}

export function describeInput(input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const { element, text, url, key, values, target } = input as Record<string, unknown>;
  const parts = [element ?? target, text, url, key, Array.isArray(values) ? values.join(", ") : values].filter((v) => typeof v === "string" && v);
  return redact(parts.join(" · ")).slice(0, 140);
}

/** 선택자로 남은 기록을 audits/의 사람 말 설명으로 바꾼다. 판정은 바꾸지 않는다. */
function readableChecks(root: string): (text: string) => string {
  const pairs: [string, string][] = [];
  for (const file of readdirSync(path.join(root, "audits")).filter((f) => f.endsWith(".json"))) {
    const spec = specSchema.parse(JSON.parse(readFileSync(path.join(root, "audits", file), "utf8")));
    for (const check of spec.scenarios.flatMap((s) => s.checks)) {
      if (!check.label || !check.selector) continue;
      pairs.push([describeCheck({ ...check, label: undefined }), check.label]);
      pairs.push([`보이지 않음: ${check.selector}${check.text ? ` "${check.text}"` : ""}`, `충족 안 됨: ${check.label}`]);
    }
  }
  return (text) => pairs.reduce((result, [from, to]) => result.replaceAll(from, to), text);
}

function publish(source: string, root: string) {
  const imageDir = path.join(root, "web/public/evidence");
  rmSync(imageDir, { recursive: true, force: true }); // 이전에 이 스크립트가 만든 사진만 있는 폴더
  mkdirSync(imageDir, { recursive: true });

  const readable = readableChecks(root);
  const tasks = new Map<string, PublishedTask>();
  let n = 0;
  for (const dir of readdirSync(source, { withFileTypes: true }).filter((d) => d.isDirectory())) {
    for (const file of readdirSync(path.join(source, dir.name)).filter((f) => f.endsWith(".json")).sort()) {
      const record = JSON.parse(readFileSync(path.join(source, dir.name, file), "utf8")) as AuditRecord;
      const key = `${record.target} ${record.task}`;
      if (!tasks.has(key)) tasks.set(key, { url: record.target, task: record.task, criteria: record.criteria.map(readable), runs: [] });

      const png = path.join(source, dir.name, file.replace(/\.json$/, ".png"));
      let screenshot: string | null = null;
      n++;
      if (existsSync(png)) {
        copyFileSync(png, path.join(imageDir, `${n}.png`));
        screenshot = `/evidence/${n}.png`;
      }
      tasks.get(key)!.runs.push({
        model: record.model,
        // 판정 규칙이 고쳐져도 원본 기록에 같은 기준을 다시 적용한다.
        outcome: judge(record.grade, record.agent),
        seconds: Math.round(record.agent.durationMs / 1000),
        notes: record.grade.notes.map((note) => readable(redact(note))),
        answer: redact(record.agent.answer).slice(0, 900),
        // 에이전트의 도구 사용 실수는 사이트의 문제가 아니므로 싣지 않는다.
        issues: findIssues(record.agent.calls)
          .filter((issue) => !["agent-misuse", "permission-denied", "other-tool-error"].includes(issue.kind))
          .map((issue) => ({ ...issue, evidence: redact(issue.evidence) })),
        actions: record.agent.calls
          .filter((c) => c.name.startsWith("browser_"))
          .map((c) => ({ tool: c.name.slice("browser_".length), detail: describeInput(c.input), failed: c.isError })),
        screenshot,
      });
    }
  }
  if (!n) throw new Error(`기록이 없습니다: ${source}`);
  writeFileSync(path.join(root, "web/src/demo/live-evidence.json"), `${JSON.stringify([...tasks.values()], null, 2)}\n`);
  console.log(`실행 ${n}건 · 과제 ${tasks.size}개 공개용으로 저장`);
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("src/audit/publish.ts")) {
  publish(process.argv[2] ?? ".intentguard/live", process.cwd());
}
