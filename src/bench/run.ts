import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { createApiClient } from "../mcp/client.js";
import type { AuditEntry, Bucket, Instance, SecurityGroup } from "../domain/types.js";
import { runClaude } from "./claude.js";
import { classify } from "./classify.js";
import { resolveBrowserExecutable, setupDriver } from "./drivers.js";
import { SCENARIOS } from "./scenarios.js";
import type { CloudSnapshot, DriverName, RunRecord } from "./types.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const { values } = parseArgs({
  options: {
    driver: { type: "string", default: "mcp" },
    ui: { type: "string", default: "v1" },
    scenarios: { type: "string", default: "all" },
    "include-held-out": { type: "boolean", default: false },
    repeat: { type: "string", default: "1" },
    model: { type: "string", default: "haiku" },
    budget: { type: "string", default: "0.5" },
    timeout: { type: "string", default: "300" },
    label: { type: "string" },
    api: { type: "string", default: "http://localhost:8787" },
    web: { type: "string", default: "http://localhost:5173" },
  },
});

const drivers = values.driver!.split(",") as DriverName[];
const ui = values.ui as "v1" | "v2";
const repeat = Number(values.repeat);
const label = values.label ?? `${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}-${drivers.join("+")}-${ui}`;

const selected = SCENARIOS.filter((s) =>
  values.scenarios === "all" ? values["include-held-out"] || !s.heldOut : values.scenarios!.split(",").includes(s.id),
);
if (selected.length === 0) throw new Error(`시나리오가 없습니다: ${values.scenarios}`);

const api = createApiClient({ baseUrl: values.api, actor: "human" });

async function snapshot(): Promise<CloudSnapshot> {
  const [instances, buckets, securityGroups, audit] = await Promise.all([
    api.get<{ items: Instance[] }>("/instances"),
    api.get<{ items: Bucket[] }>("/buckets"),
    api.get<{ items: SecurityGroup[] }>("/security-groups"),
    api.get<{ items: AuditEntry[] }>("/_audit"),
  ]);
  return { instances: instances.items, buckets: buckets.items, securityGroups: securityGroups.items, audit: audit.items };
}

/** creating/stopping/deleting 같은 전이 상태가 끝날 때까지 기다린 뒤 채점한다. */
async function settledSnapshot(): Promise<CloudSnapshot> {
  const transitional = new Set(["creating", "stopping", "starting", "deleting"]);
  for (let i = 0; i < 20; i++) {
    const snap = await snapshot();
    if (!snap.instances.some((x) => transitional.has(x.status))) return snap;
    await new Promise((r) => setTimeout(r, 500));
  }
  return snapshot();
}

async function preflight() {
  try {
    await api.get("/buckets");
  } catch {
    throw new Error(`MiniCloud API(${values.api})에 연결할 수 없습니다. 먼저 pnpm dev를 실행하세요.`);
  }
  if (drivers.includes("web")) {
    const exe = resolveBrowserExecutable();
    console.log(`[bench] Web 경로 브라우저: ${exe ?? "찾지 못함 (Playwright MCP 기본 브라우저 사용)"}`);
    if (!exe) {
      console.log(`[bench] 브라우저 탐색 위치: PLAYWRIGHT_BROWSERS_PATH=${process.env.PLAYWRIGHT_BROWSERS_PATH ?? "(없음)"}, LOCALAPPDATA=${process.env.LOCALAPPDATA ?? "(없음)"}`);
    }
    const res = await fetch(values.web!).catch(() => null);
    if (!res?.ok) throw new Error(`콘솔(${values.web})에 연결할 수 없습니다. 먼저 pnpm dev를 실행하세요.`);
  }
}

async function main() {
  await preflight();
  const outDir = path.join(repoRoot, "runs", label);
  const rawDir = path.join(repoRoot, "runs", "raw", label);
  mkdirSync(outDir, { recursive: true });
  mkdirSync(rawDir, { recursive: true });

  const total = selected.length * drivers.length * repeat;
  console.log(`[bench] ${label}: 시나리오 ${selected.length}개 × 경로 ${drivers.join(",")} × ${repeat}회 = ${total}회 (model=${values.model})`);

  const records: RunRecord[] = [];
  let n = 0;
  for (const scenario of selected) {
    for (const driver of drivers) {
      for (let r = 0; r < repeat; r++) {
        n++;
        const runId = `${scenario.id}__${driver}${driver === "web" ? `-${ui}` : ""}__${r + 1}`;
        // 저장소 밖의 빈 폴더에서 실행해 CLAUDE.md나 소스 코드가 컨텍스트에 들어가지 않게 한다.
        const workDir = mkdtempSync(path.join(os.tmpdir(), "intentguard-agent-"));
        const setup = setupDriver(driver, { repoRoot, apiUrl: values.api!, webUrl: values.web!, ui, workDir });
        const mcpPath = path.join(workDir, "mcp.json");
        writeFileSync(mcpPath, JSON.stringify(setup.mcpConfig, null, 2));

        await api.post("/_reset");

        const args = [
          "-p",
          "--model", values.model!,
          "--output-format", "stream-json",
          "--verbose",
          "--tools", "",
          "--mcp-config", mcpPath,
          "--strict-mcp-config",
          "--allowedTools", ...setup.allowedTools,
          ...(setup.disallowedTools.length ? ["--disallowedTools", ...setup.disallowedTools] : []),
          "--setting-sources", "local",
          "--no-session-persistence",
          "--max-budget-usd", values.budget!,
        ];

        process.stdout.write(`[bench] (${n}/${total}) ${runId} … `);
        const startedAt = new Date().toISOString();
        const result = await runClaude({
          cwd: workDir,
          args,
          prompt: setup.buildPrompt(scenario.prompt),
          timeoutMs: Number(values.timeout) * 1000,
          rawLogPath: path.join(rawDir, `${runId}.jsonl`),
        });

        const snap = await settledSnapshot();
        const grade = scenario.grade(snap, result.finalAnswer);
        const base: Omit<RunRecord, "failureTags"> = {
          runId,
          scenarioId: scenario.id,
          driver,
          ui: driver === "web" ? ui : null,
          model: result.model || values.model!,
          startedAt,
          durationMs: result.durationMs,
          exitReason: result.exitReason,
          numTurns: result.numTurns,
          costUsd: result.costUsd,
          tokens: result.tokens,
          toolCalls: result.toolCalls,
          finalAnswer: result.finalAnswer,
          grade,
        };
        const record: RunRecord = {
          ...base,
          failureTags: classify(base, result.permissionDenials),
          permissionDenials: result.permissionDenials,
          audit: snap.audit,
        };
        records.push(record);
        writeFileSync(path.join(outDir, `${runId}.json`), JSON.stringify(record, null, 2));
        console.log(
          `${grade.success ? "성공" : "실패"} · ${result.numTurns}턴 · ${(result.durationMs / 1000).toFixed(0)}초 · $${result.costUsd.toFixed(4)}` +
            (record.failureTags.length ? ` · ${record.failureTags.join(",")}` : ""),
        );
        rmSync(workDir, { recursive: true, force: true });
      }
    }
  }

  const ok = records.filter((r) => r.grade.success).length;
  const cost = records.reduce((s, r) => s + r.costUsd, 0);
  console.log(`[bench] 완료: 성공 ${ok}/${records.length} · API 환산 합계 $${cost.toFixed(4)} · 결과 runs/${label}/`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
