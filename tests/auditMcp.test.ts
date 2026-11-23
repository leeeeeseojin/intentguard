import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, describe, expect, it } from "vitest";
import { createAuditMcpServer } from "../src/audit/mcp.js";
import type { AuditRecord } from "../src/audit/report.js";
import type { RunOptions } from "../src/audit/run.js";

const ARGS = { url: "https://a.example/", task: "주문해줘", expect: ["주문 완료"], persist: true };

const record = ({ job, model }: RunOptions, outcome: AuditRecord["outcome"] = "false-success"): AuditRecord => ({
  id: job.id,
  target: job.url,
  task: job.task,
  criteria: job.criteria,
  startedAt: "",
  model,
  attempt: 1,
  outcome,
  grade: { success: false, notes: ["충족 안 됨"], checks: [{ label: "주문 완료", met: false, reason: "보이지 않음" }] },
  issues: [{ kind: "click-blocked", count: 2, fix: "덮고 있는 요소 확인", evidence: "intercepts pointer events" }],
  blocked: [],
  agent: { exit: "completed", answer: "RESULT: confirmed", model, steps: 3, durationMs: 4000, tokens: { input: 0, cacheRead: 0, output: 0 }, calls: [], outsideTools: [], error: "" },
});

let outRoot: string;
afterEach(() => rmSync(outRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));

async function connect(run: (o: RunOptions) => Promise<AuditRecord>) {
  outRoot = mkdtempSync(path.join(os.tmpdir(), "intentguard-mcp-test-"));
  const server = createAuditMcpServer({ outRoot, run });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([server.connect(b), client.connect(a)]);
  return client;
}

const parse = (r: unknown) => JSON.parse(((r as CallToolResult).content[0] as { text: string }).text);

describe("검사 MCP 서버", () => {
  it("audit_site 하나만 노출하고, 확인 범위(persist)는 반드시 받는다", async () => {
    const client = await connect(async (o) => record(o));
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(["audit_site"]);
    expect(tools[0]?.inputSchema.required).toEqual(expect.arrayContaining(["url", "task", "expect", "persist"]));
  });

  it("검사기의 판정·근거·볼 곳·증거 경로를 그대로 돌려준다", async () => {
    const client = await connect(async (o) => record(o));
    const result = parse(await client.callTool({ name: "audit_site", arguments: ARGS }));
    expect(result.runs[0]).toMatchObject({
      model: "gemini-3.8-flash-low",
      outcome: "false-success",
      agentSaid: "confirmed",
      checks: [{ met: false, reason: "보이지 않음" }],
    });
    expect(result.runs[0].lookAt.map((a: { title: string }) => a.title)).toContain("안 됐는데 됐다고 믿음");
    expect(result.runs[0].evidence.record).toMatch(/01-gemini-3\.8-flash-low\.json$/);
    expect(result.criteria[0]).toContain("새로고침 뒤에도");
  });

  it("쓰기는 기본으로 막고, 실행기에 그대로 넘긴다", async () => {
    const seen: RunOptions[] = [];
    const client = await connect(async (o) => (seen.push(o), record(o, "confirmed-success")));
    await client.callTool({ name: "audit_site", arguments: { ...ARGS, models: ["gemini-3.8-flash-low", "gpt-oss-120b-medium"] } });
    expect(seen.map((o) => o.model)).toEqual(["gemini-3.8-flash-low", "gpt-oss-120b-medium"]);
    expect(seen.every((o) => o.job.allowWrites === false)).toBe(true);
  });

  it.each<[string, object]>([
    ["file 주소", { url: "file:///C:/secret.txt" }],
    ["목록에 없는 모델", { models: ["--dangerously-skip-permissions"] }],
    ["빈 기준", { expect: [] }],
  ])("%s는 실행하지 않는다", async (_, patch) => {
    let ran = false;
    const client = await connect(async (o) => ((ran = true), record(o)));
    const r = (await client.callTool({ name: "audit_site", arguments: { ...ARGS, ...patch } })) as CallToolResult;
    expect(r.isError).toBe(true);
    expect(ran).toBe(false);
  });

  it("한 모델이 실행되지 못해도 다음 모델을 검사하고 이유를 남긴다", async () => {
    const client = await connect(async (o) => {
      if (o.model.startsWith("gemini")) throw new Error("check: 시작 화면에서 이미 성공 조건을 만족합니다.\n자세한 로그");
      return record(o);
    });
    const result = parse(await client.callTool({ name: "audit_site", arguments: { ...ARGS, models: ["gemini-3.8-flash-low", "gpt-oss-120b-medium"] } }));
    expect(result.runs).toMatchObject([{ outcome: "not-run", error: "시작 화면에서 이미 성공 조건을 만족합니다." }, { outcome: "false-success" }]);
  });

  it("검사 중에 또 요청하면 거절한다", async () => {
    let release!: () => void;
    const client = await connect((o) => new Promise((resolve) => (release = () => resolve(record(o)))));
    const first = client.callTool({ name: "audit_site", arguments: ARGS });
    await new Promise((r) => setTimeout(r, 20));
    const second = (await client.callTool({ name: "audit_site", arguments: ARGS })) as CallToolResult;
    expect(second.isError).toBe(true);
    release();
    expect(parse(await first).runs).toHaveLength(1);
  });
});
