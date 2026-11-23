import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { advise } from "../src/app/advice.js";
import { Audits, type AuditInput } from "../src/app/audits.js";
import { createApp } from "../src/app/server.js";
import type { AuditRecord } from "../src/audit/report.js";
import type { RunOptions } from "../src/audit/run.js";

const PORT = 4717;
const HOST = `127.0.0.1:${PORT}`;
const INPUT: AuditInput = {
  url: "https://a.example/",
  task: "주문해줘",
  expect: ["주문 완료"],
  persist: true,
  allowWrites: false,
  models: ["gemini-3.8-flash-low"],
};

const record = ({ job, model }: RunOptions): AuditRecord => ({
  id: job.id,
  target: job.url,
  task: job.task,
  criteria: job.criteria,
  startedAt: "",
  model,
  attempt: 1,
  outcome: "false-success",
  grade: { success: false, notes: ["충족 안 됨"], checks: [{ label: "주문 완료", met: false, reason: "보이지 않음" }] },
  issues: [],
  blocked: [],
  agent: { exit: "completed", answer: "했어요\nRESULT: confirmed", model, steps: 2, durationMs: 3000, tokens: { input: 0, cacheRead: 0, output: 0 }, calls: [], outsideTools: [], error: "" },
});

const finishes = async (o: RunOptions) => {
  o.onCall?.({ name: "browser_click", input: { element: "주문 버튼" }, isError: false, resultPreview: "" });
  return record(o);
};
const hangs = (o: RunOptions) =>
  new Promise<AuditRecord>((_, reject) => o.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));

let root: string;
let audits: Audits;
beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), "intentguard-app-test-"));
});
afterEach(async () => {
  await audits.close();
  rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

function setup(execute: (o: RunOptions) => Promise<AuditRecord> = finishes, ready = true, claudeCode = ready) {
  audits = new Audits(root, execute);
  const app = createApp({ audits, port: PORT, ui: root, agent: () => ({ ready: ready || claudeCode, antigravity: ready, claudeCode }) });
  const get = (url: string, headers: Record<string, string> = {}) => app.request(url, { headers: { host: HOST, ...headers } });
  const post = (url: string, body: object = INPUT, headers: Record<string, string> = {}) =>
    app.request(url, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { host: HOST, "content-type": "application/json", "x-intentguard": "app", ...headers },
    });
  return { get, post };
}

describe("검사 앱은 다른 페이지가 조종할 수 없다", () => {
  it.each<[string, Record<string, string>]>([
    ["DNS 리바인딩", { host: `evil.example:${PORT}` }],
    ["다른 포트의 Host", { host: "127.0.0.1:3000" }],
    ["다른 출처", { origin: "https://evil.example" }],
    ["다른 localhost 포트", { origin: "http://127.0.0.1:3000" }],
    ["출처 없는 교차 사이트 요청", { "sec-fetch-site": "cross-site" }],
    ["같은 사이트의 다른 출처", { "sec-fetch-site": "same-site" }],
    ["전용 헤더 없음", { "x-intentguard": "" }],
    ["단순 요청", { "content-type": "text/plain" }],
  ])("%s는 검사를 시작하지 못한다", async (_, headers) => {
    const { post } = setup();
    expect((await post("/api/audits", INPUT, headers)).status).toBe(403);
    expect(audits.list()).toEqual([]);
  });

  it("다른 사이트는 기록도 읽지 못한다", async () => {
    const { get } = setup();
    expect((await get("/api/audits", { "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect((await get("/api/audits", { host: "evil.example" })).status).toBe(403);
  });

  it.each(["http://127.0.0.1:4717/", "http://localhost:4717/x"])("자기 자신(%s)은 검사하지 않는다", async (url) => {
    const { post } = setup();
    expect((await post("/api/audits", { ...INPUT, url })).status).toBe(400);
  });

  it("화면 폴더 밖의 파일은 내주지 않는다", async () => {
    const { get } = setup();
    expect((await get("/assets/..%2F.gitignore")).status).toBe(404);
    expect((await get("/assets/.gitignore")).status).toBe(404);
  });
});

describe("입력", () => {
  it.each<[string, object]>([
    ["file 주소", { url: "file:///C:/secret.txt" }],
    ["스크립트 주소", { url: "javascript:alert(1)" }],
    ["계정이 든 주소", { url: "https://id:pw@a.example/" }],
    ["주소가 아님", { url: "그냥 글자" }],
    ["빈 기준", { expect: [] }],
    ["확인 범위를 고르지 않음", { persist: undefined }],
    ["목록에 없는 모델", { models: ["--dangerously-skip-permissions"] }],
    ["모델 없음", { models: [] }],
  ])("%s는 거부한다", async (_, patch) => {
    const { post } = setup();
    expect((await post("/api/audits", { ...INPUT, ...patch })).status).toBe(400);
  });

  it("조작 에이전트가 하나도 없으면 시작하지 않는다", async () => {
    const { post } = setup(finishes, false);
    expect((await post("/api/audits")).status).toBe(503);
  });

  it("고른 모델의 에이전트가 이 PC에 없으면 시작하지 않고, 있는 쪽 모델은 돌린다", async () => {
    const { post } = setup(finishes, true, false);
    const refused = await post("/api/audits", { ...INPUT, models: ["claude-code:claude-haiku-5-5"] });
    expect(refused.status).toBe(503);
    expect((await refused.json()).error).toContain("Claude Code");
    expect((await post("/api/audits")).status).toBe(201);
  });
});

describe("검사 흐름", () => {
  it("판정·보고·조작·볼 곳을 남기고, 재검사는 이전 검사와 이어진다", async () => {
    const { post, get } = setup();
    const first = (await (await post("/api/audits")).json()) as { id: string };
    await expect.poll(() => audits.get(first.id)?.state).toBe("finished");
    expect(await (await get(`/api/audits/${first.id}`)).json()).toMatchObject({
      runs: [{ steps: [{ tool: "click", detail: "주문 버튼" }], result: { outcome: "false-success", said: "confirmed", success: false } }],
    });
    await new Promise((resolve) => setTimeout(resolve));
    const again = await (await post(`/api/audits/${first.id}/rerun`, {})).json();
    expect(again).toMatchObject({ number: 2, previous: first.id, input: INPUT });
  });

  it("한 번에 하나만 돌고, 중단하면 다음 검사를 받을 수 있다", async () => {
    const { post } = setup(hangs);
    const first = (await (await post("/api/audits")).json()) as { id: string };
    expect((await post("/api/audits")).status).toBe(409);
    expect((await post(`/api/audits/${first.id}/cancel`, {})).status).toBe(200);
    expect(audits.get(first.id)).toMatchObject({ state: "cancelled", runs: [{ state: "cancelled" }] });
    expect((await post("/api/audits")).status).toBe(201);
  });

  it("한 모델이 실행되지 못해도 다음 모델은 검사한다", async () => {
    setup(async (o) => {
      if (o.model.startsWith("gemini")) throw new Error("접속 실패\n자세한 로그");
      return record(o);
    });
    const { id } = audits.start({ ...INPUT, models: ["gemini-3.8-flash-low", "gpt-oss-120b-medium"] });
    await expect.poll(() => audits.get(id)?.state).toBe("finished");
    expect(audits.get(id)?.runs).toMatchObject([{ state: "error", message: "접속 실패" }, { state: "done" }]);
  });

  it("앱이 꺼졌던 검사는 진행 중으로 남지 않는다", async () => {
    setup(hangs);
    const { id } = audits.start(INPUT);
    const file = path.join(root, id, "audit.json");
    const saved = readFileSync(file, "utf8");
    await audits.close();
    writeFileSync(file, saved); // 꺼지기 직전의 기록
    setup();
    expect(audits.get(id)).toMatchObject({ state: "interrupted", runs: [{ state: "cancelled" }] });
  });
});

describe("고치기 전에 볼 곳", () => {
  it("에이전트의 도구 실수는 사이트 문제로 올리지 않는다", () => {
    const issue = (kind: string) => ({ kind, count: 2, fix: "확인", evidence: "" });
    expect(advise("confirmed-success", [], [issue("agent-misuse"), issue("click-blocked")])).toMatchObject([{ title: "누르려던 요소가 다른 것에 가려짐 2번" }]);
  });

  it("기준을 못 채우면 사람이 적은 기준부터 의심하게 한다", () => {
    expect(advise("failure", [{ label: "x", met: false }], []).map((a) => a.title)).toContain("성공 기준이 맞는지 먼저 확인");
  });

  it("무효 실행으로는 사이트를 탓하지 않는다", () => {
    expect(advise("invalid", [{ label: "x", met: false }], [])).toEqual([]);
  });
});
