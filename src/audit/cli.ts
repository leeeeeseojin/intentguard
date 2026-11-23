import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { SCENARIOS } from "../bench/scenarios.js";
import type { SharedBrowser } from "./browser.js";
import { gradeMiniCloud, specSchema } from "./grade.js";
import { toMarkdown, type AuditRecord } from "./report.js";
import { runJob, screenJob, type Job } from "./run.js";

/**
 * 배포된 URL을 Antigravity CLI로 검사한다. 로컬 서버는 필요 없다.
 *   pnpm exec tsx src/audit/cli.ts                                  # 배포된 MiniCloud v2, 과제 10개
 *   pnpm exec tsx src/audit/cli.ts --ui v1,v2 --only create-server
 *   pnpm exec tsx src/audit/cli.ts --spec audits/deallens.json      # 다른 서비스
 *   pnpm exec tsx src/audit/cli.ts --url https://내.사이트 --task "요금 안내를 열어줘" --expect "월 9,900원"
 *   --persist 를 붙이면 새로고침 뒤에도 남아야 성공. 화면으로 쓰려면 src/app/main.ts
 *   --model a,b,c 로 여러 모델을 같은 과제로 돌린다
 */
const { values } = parseArgs({
  options: {
    spec: { type: "string" },
    url: { type: "string" },
    ui: { type: "string", default: "v2" },
    task: { type: "string" },
    expect: { type: "string", multiple: true },
    persist: { type: "boolean", default: false },
    "allow-writes": { type: "boolean", default: false },
    only: { type: "string" },
    repeat: { type: "string", default: "1" },
    model: { type: "string", default: "gemini-3.8-flash-low" },
    timeout: { type: "string", default: "240" },
    out: { type: "string", default: ".intentguard" },
  },
});

function loadJobs(): Job[] {
  if (values.task && !values.spec && !(values.url && values.expect?.length)) {
    throw new Error("--task에는 --url과 --expect(끝났을 때 화면에 보여야 할 글자)가 함께 필요합니다.");
  }
  if (values.spec || values.task) {
    const spec = specSchema.parse(
      values.spec
        ? JSON.parse(readFileSync(values.spec, "utf8"))
        : {
            url: values.url,
            allowWrites: values["allow-writes"],
            // --expect는 화면에 보이는 글자. 선택자를 몰라도 쓸 수 있다.
            scenarios: [{ id: "custom-task", task: values.task, checks: values.expect!.map((exactText) => ({ exactText })), persist: values.persist }],
          },
    );
    const url = values.url ?? spec.url;
    return spec.scenarios.map((scenario) => screenJob({ ...scenario, url, allowWrites: spec.allowWrites }));
  }
  const { origin } = new URL(values.url ?? "https://intentguard-plum.vercel.app");
  return values.ui!.split(",").flatMap((ui) => {
    if (ui !== "v1" && ui !== "v2") throw new Error(`--ui는 v1 또는 v2입니다: ${ui}`);
    return SCENARIOS.map(({ id, title, prompt }) => ({
      id,
      criteria: [`${title}: 저장된 최종 상태와 감사 로그로 채점`],
      url: `${origin}/?ui=${ui}&actor=agent`,
      task: prompt,
      allowWrites: false,
      grade: (b: SharedBrowser, answer: string) => gradeMiniCloud(b.context, origin, id, answer),
    }));
  });
}

async function main() {
  const repeat = Number(values.repeat);
  const timeoutMs = Number(values.timeout) * 1000;
  if (!Number.isInteger(repeat) || repeat < 1 || !(timeoutMs > 0)) throw new Error("--repeat와 --timeout은 양수여야 합니다.");

  const only = values.only?.split(",");
  const models = values.model!.split(",");
  const jobs = loadJobs().filter((job) => !only || only.includes(job.id));
  if (!jobs.length) throw new Error("실행할 과제가 없습니다. --only 값을 확인하세요.");

  mkdirSync(values.out!, { recursive: true });
  writeFileSync(path.join(values.out!, ".gitignore"), "*\n"); // 실행 기록에는 화면 내용이 들어가므로 기본은 커밋 제외
  const dir = path.resolve(values.out!, new Date().toISOString().replace(/[:.]/g, "-"));
  mkdirSync(dir);

  console.log(`[audit] ${models.map((m) => (m.startsWith("claude-code:") ? `Claude Code(${m.slice(12)})` : `Antigravity(${m})`)).join(", ")} · ${jobs.length * models.length * repeat}회 · ${dir}`);
  const records: AuditRecord[] = [];
  let n = 0;
  for (const job of jobs) {
    for (const { model, attempt } of models.flatMap((m) => Array.from({ length: repeat }, (_, i) => ({ model: m, attempt: i + 1 })))) {
      const name = `${String(++n).padStart(2, "0")}-${job.id}-${model.replace(/[^a-z0-9.-]/gi, "")}`;
      const record = await runJob({ job, model, attempt, dir, name, timeoutMs });
      const { agent, grade } = record;
      records.push(record);
      writeFileSync(path.join(dir, "report.md"), toMarkdown(records));
      console.log(`[audit] ${name} [${record.model}] (${job.url}) → ${record.outcome} · ${agent.steps}단계 · ${Math.round(agent.durationMs / 1000)}초 · ${grade.notes.join(" / ")}`);
      if (agent.exit !== "completed") console.log(`[audit]   ${agent.exit}: ${agent.error}`);
      if (agent.outsideTools.length) console.log(`[audit]   화면 밖 도구 사용: ${agent.outsideTools.join(", ")}`);
    }
  }
  console.log(`[audit] 리포트: ${path.join(dir, "report.md")}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
