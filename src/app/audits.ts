import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { CheckResult } from "../audit/grade.js";
import { describeInput, redact } from "../audit/publish.js";
import { selfReport, type Outcome, type SelfReport } from "../audit/report.js";
import { runJob, screenJob } from "../audit/run.js";
import { advise, type Advice } from "./advice.js";
import { MODELS } from "./models.js";

export const inputSchema = z.object({
  url: z
    .string()
    .trim()
    .max(2000)
    .refine((value) => {
      if (!URL.canParse(value)) return false;
      const { protocol, username, password } = new URL(value);
      return (protocol === "https:" || protocol === "http:") && !username && !password;
    }, "http 또는 https로 시작하는 주소를 넣어 주세요.")
    .transform((value) => new URL(value).href),
  task: z.string().trim().min(1, "시킬 일을 적어 주세요.").max(1000, "시킬 일은 1000자까지입니다."),
  expect: z.array(z.string().trim().min(1).max(200, "성공 기준은 한 줄에 200자까지입니다.")).min(1, "성공 기준을 적어 주세요.").max(5, "성공 기준은 5줄까지입니다."),
  // 기본값을 두면 저장 과제가 화면 문구만으로 성공 처리된다. 반드시 고르게 한다.
  persist: z.boolean({ error: "결과가 어디까지 남아야 하는지 골라 주세요." }),
  allowWrites: z.boolean(),
  models: z
    .array(z.enum(MODELS, { error: "지원하지 않는 모델입니다." }))
    .min(1, "모델을 하나 이상 골라 주세요.")
    .refine((models) => new Set(models).size === models.length, "같은 모델이 두 번 들어 있습니다."),
});

export type AuditInput = z.infer<typeof inputSchema>;

export interface Step {
  tool: string;
  detail: string;
  failed: boolean;
}

export interface AppRun {
  model: string;
  state: "waiting" | "starting" | "working" | "grading" | "done" | "error" | "cancelled";
  steps: Step[];
  message?: string;
  result?: {
    outcome: Outcome;
    success: boolean;
    said: SelfReport;
    seconds: number;
    notes: string[];
    checks: CheckResult[];
    cautions: string[];
    advice: Advice[];
    answer: string;
    /** 무효일 때 CLI가 남긴 이유 */
    error: string;
    screenshot: boolean;
  };
}

export interface Audit {
  id: string;
  number: number;
  input: AuditInput;
  state: "running" | "finished" | "cancelled" | "interrupted";
  runs: AppRun[];
  /** 재검사라면 비교할 이전 검사 */
  previous?: string;
}

export interface AuditSummary {
  id: string;
  number: number;
  url: string;
  task: string;
  state: Audit["state"];
  outcomes: (Outcome | null)[];
}

const ACTIVE: AppRun["state"][] = ["waiting", "starting", "working", "grading"];
const TIMEOUT_MS = 240_000;

export class BusyError extends Error {}

/** 검사 기록 보관과 순차 실행. 메모리와 사용량 때문에 한 번에 하나만 돈다. */
export class Audits {
  private readonly all = new Map<string, Audit>();
  private current: { id: string; abort: AbortController; finished: Promise<void> } | null = null;

  constructor(
    private readonly root: string,
    private readonly execute: typeof runJob = runJob,
  ) {
    mkdirSync(root, { recursive: true });
    writeFileSync(path.join(root, ".gitignore"), "*\n"); // 화면 내용이 들어가므로 커밋 제외
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      const file = path.join(root, entry.name, "audit.json");
      if (!entry.isDirectory() || !existsSync(file)) continue;
      try {
        const audit = JSON.parse(readFileSync(file, "utf8")) as Audit;
        if (audit.state === "running") {
          audit.state = "interrupted";
          this.stopRemaining(audit, "검사 앱이 꺼져 중단됨");
          this.save(audit);
        }
        this.all.set(audit.id, audit);
      } catch {
        console.warn(`[app] 읽을 수 없는 기록은 건너뜁니다: ${file}`);
      }
    }
  }

  list(): AuditSummary[] {
    return [...this.all.values()]
      .sort((a, b) => b.number - a.number)
      .map(({ id, number, input, state, runs }) => ({ id, number, url: input.url, task: input.task, state, outcomes: runs.map((r) => r.result?.outcome ?? null) }));
  }

  get(id: string): Audit | undefined {
    return this.all.get(id);
  }

  screenshot(id: string, index: number): string | undefined {
    if (!this.all.get(id)?.runs[index]?.result?.screenshot) return undefined;
    return path.join(this.root, id, `run-${index}.png`);
  }

  start(input: AuditInput, previous?: string): Audit {
    if (this.current) throw new BusyError("다른 검사가 진행 중입니다. 끝나거나 중단한 뒤 다시 시작해 주세요.");
    const audit: Audit = {
      id: randomBytes(8).toString("hex"),
      number: Math.max(0, ...[...this.all.values()].map((a) => a.number)) + 1,
      input,
      state: "running",
      previous,
      runs: input.models.map((model) => ({ model, state: "waiting", steps: [] })),
    };
    mkdirSync(path.join(this.root, audit.id));
    this.all.set(audit.id, audit);
    this.save(audit);
    const abort = new AbortController();
    const finished = this.work(audit, abort.signal)
      .catch((err: unknown) => console.error("[app] 검사 실패", err))
      .finally(() => {
        this.current = null;
      });
    this.current = { id: audit.id, abort, finished };
    return audit;
  }

  async cancel(id: string): Promise<boolean> {
    if (this.current?.id !== id) return false;
    const { abort, finished } = this.current;
    abort.abort();
    await finished;
    return true;
  }

  async close(): Promise<void> {
    if (this.current) await this.cancel(this.current.id);
  }

  private async work(audit: Audit, signal: AbortSignal) {
    const { url, task, expect, persist, allowWrites } = audit.input;
    const job = screenJob({ id: "check", url, task, persist, allowWrites, checks: expect.map((exactText) => ({ exactText })) });
    const dir = path.join(this.root, audit.id);

    for (const [index, run] of audit.runs.entries()) {
      if (signal.aborted) break;
      const name = `run-${index}`;
      run.state = "starting";
      this.save(audit);
      try {
        const record = await this.execute({
          job,
          model: run.model,
          attempt: 1,
          dir,
          name,
          timeoutMs: TIMEOUT_MS,
          signal,
          onGrading: () => {
            run.state = "grading";
          },
          onCall: (call) => {
            if (!call.name.startsWith("browser_")) return;
            run.state = "working";
            run.steps.push({ tool: call.name.slice("browser_".length), detail: describeInput(call.input), failed: call.isError });
          },
        });
        const { agent, grade, outcome } = record;
        const checks = grade.checks ?? [];
        run.state = "done";
        run.result = {
          outcome,
          success: grade.success,
          said: selfReport(agent.answer),
          seconds: Math.round(agent.durationMs / 1000),
          notes: grade.notes.map((note) => redact(note)),
          checks,
          cautions: record.cautions ?? [],
          advice: advise(outcome, checks, record.issues.map((issue) => ({ ...issue, evidence: redact(issue.evidence) }))),
          answer: redact(agent.answer).slice(0, 1500),
          error: outcome === "invalid" ? redact(agent.error).slice(0, 300) : "",
          screenshot: existsSync(path.join(dir, `${name}.png`)),
        };
      } catch (err) {
        run.state = signal.aborted ? "cancelled" : "error";
        const message = err instanceof Error ? err.message : String(err);
        run.message = signal.aborted ? "사용자가 중단함" : redact(message.split("\n")[0] ?? "").replace(/^check: /, "");
      }
      this.save(audit);
    }
    if (signal.aborted) this.stopRemaining(audit, "사용자가 중단함");
    audit.state = signal.aborted ? "cancelled" : "finished";
    this.save(audit);
  }

  private stopRemaining(audit: Audit, message: string) {
    for (const run of audit.runs) {
      if (ACTIVE.includes(run.state)) Object.assign(run, { state: "cancelled", message });
    }
  }

  private save(audit: Audit) {
    writeFileSync(path.join(this.root, audit.id, "audit.json"), JSON.stringify(audit, null, 2));
  }
}
