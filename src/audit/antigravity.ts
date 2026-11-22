import { execFileSync, spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { ToolCall } from "../bench/types.js";

/** 플러그인으로 넣은 MCP 서버는 "플러그인 이름_서버 이름"으로 불린다. 권한 규칙도 이 이름을 써야 한다. */
const PLUGIN = "intentguard-browser";
export const MCP_SERVER = `${PLUGIN}_playwright`;

/** 사람이 화면에서 할 수 있는 조작만 허용한다. */
const ALLOWED = [
  "navigate", "navigate_back", "snapshot", "find", "click", "type", "fill_form",
  "select_option", "press_key", "hover", "drag", "handle_dialog", "wait_for", "tabs", "resize", "console_messages",
];

/** 화면을 거치지 않는 수단은 전부 막는다. Deny가 사용자의 전역 Allow보다 우선한다. */
const DENIED = [
  "command(*)", "unsandboxed(*)", "read_file(*)", "write_file(*)", "read_url(*)", "execute_url(*)",
  // 허용도 거부도 안 된 도구를 부르면 headless 세션이 통째로 끝나므로, 쓰지 않는 도구는 빠짐없이 적는다.
  ...["evaluate", "run_code_unsafe", "file_upload", "drop", "close", "network_request", "network_requests", "take_screenshot", "emulate_media"].map(
    (tool) => `mcp(${MCP_SERVER}/browser_${tool})`,
  ),
];

export interface AgentResult {
  exit: "completed" | "timeout" | "error";
  answer: string;
  /** CLI가 실행을 시작하며 스스로 보고한 모델 */
  model: string;
  /** 모델 응답 횟수. Claude Code의 num_turns와 세는 방식이 달라 서로 비교하면 안 된다. */
  steps: number;
  durationMs: number;
  tokens: { input: number; cacheRead: number; output: number };
  calls: ToolCall[];
  /** 브라우저 MCP가 아닌 도구로 실제 성공한 호출. 있으면 실험 무효. */
  outsideTools: string[];
  error: string;
}

// 작업 결과에 영향을 주지 않는 CLI 내부 도구
const HARMLESS = new Set(["finish", "wait", "list_permissions"]);

/** agy --output-format stream-json 출력을 실행 결과로 바꾼다. */
export function parseStream(lines: string[]): Omit<AgentResult, "durationMs"> {
  const calls: ToolCall[] = [];
  const outside: string[] = [];
  const tokens = { input: 0, cacheRead: 0, output: 0 };
  let steps = 0;
  let answer = "";
  let model = "";
  let status = "";
  let error = "";

  for (const line of lines) {
    let message: any;
    try {
      message = JSON.parse(line);
    } catch {
      continue;
    }
    if (message.init?.model) model = String(message.init.model);
    const step = message.step_update;
    if (step?.step_type === "agent_response" && step.state === "DONE") steps++;
    if (step?.step_type === "tool" && (step.state === "DONE" || step.state === "ERROR")) {
      const params = step.tool_info?.parameters ?? {};
      const browser = step.tool_name === "call_mcp_tool" && params.ServerName === MCP_SERVER;
      const output = String(step.tool_info?.error?.message ?? step.tool_info?.output ?? "");
      calls.push({
        name: browser ? String(params.ToolName) : String(step.tool_name),
        input: browser ? params.Arguments : params,
        // Playwright MCP는 실패도 정상 응답 본문의 "### Error"로 돌려준다.
        isError: step.state === "ERROR" || output.startsWith("### Error"),
        resultPreview: output.slice(0, 2000),
      });
      if (!browser && step.state === "DONE" && !HARMLESS.has(step.tool_name)) outside.push(String(step.tool_name));
    }
    if (message.result) {
      status = message.result.status ?? "";
      answer = String(message.result.response ?? "").trim();
      error = String(message.result.error ?? "");
      tokens.input = message.result.usage?.input_tokens ?? 0;
      tokens.cacheRead = message.result.usage?.cache_read_tokens ?? 0;
      tokens.output = message.result.usage?.output_tokens ?? 0;
    }
  }
  return { exit: status === "SUCCESS" && answer ? "completed" : "error", answer, model, steps, tokens, calls, outsideTools: [...new Set(outside)], error };
}

export function resolveAgy(): string {
  if (process.env.AGY_BIN) return process.env.AGY_BIN;
  if (process.env.LOCALAPPDATA) {
    const exe = path.join(process.env.LOCALAPPDATA, "agy/bin/agy.exe");
    if (existsSync(exe)) return exe;
  }
  return "agy";
}

export interface AgentOptions {
  /** 저장소 밖의 빈 폴더 */
  workDir: string;
  cdpEndpoint: string;
  prompt: string;
  model: string;
  timeoutMs: number;
  logPath: string;
}

/**
 * Antigravity CLI를 격리해서 실행한다.
 * 작업 폴더의 플러그인과 이번 세션 전용 --settings만 쓰므로 사용자의 전역 설정은 바뀌지 않는다.
 */
export function runAntigravity(o: AgentOptions): Promise<AgentResult> {
  const plugin = path.join(o.workDir, ".agents/plugins", PLUGIN);
  mkdirSync(plugin, { recursive: true });
  const mcpCli = path.join(path.dirname(createRequire(import.meta.url).resolve("@playwright/mcp/package.json")), "cli.js");
  writeFileSync(path.join(plugin, "plugin.json"), JSON.stringify({ name: PLUGIN }));
  writeFileSync(
    path.join(plugin, "mcp_config.json"),
    JSON.stringify({
      mcpServers: {
        playwright: {
          command: process.execPath,
          args: [mcpCli, "--cdp-endpoint", o.cdpEndpoint, "--image-responses", "omit", "--output-dir", path.join(o.workDir, "pw-out")],
        },
      },
    }),
  );
  const settings = path.join(o.workDir, "session.json");
  writeFileSync(settings, JSON.stringify({ permissions: { allow: ALLOWED.map((t) => `mcp(${MCP_SERVER}/browser_${t})`), deny: DENIED } }));

  const args = [
    "--model", o.model, "--settings", settings, "--output-format", "stream-json", "--disable-slash-commands",
    "--print-timeout", `${Math.ceil(o.timeoutMs / 1000)}s`, "-p", o.prompt,
  ];

  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(resolveAgy(), args, { cwd: o.workDir, stdio: ["ignore", "pipe", "pipe"], detached: process.platform !== "win32" });
    const log = createWriteStream(o.logPath);
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        if (process.platform === "win32") execFileSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
        else process.kill(-child.pid!, "SIGKILL");
      } catch {
        // 이미 종료됨
      }
    }, o.timeoutMs + 10_000);

    const finish = (spawnError = "") => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      log.end();
      const parsed = parseStream(stdout.split("\n"));
      resolve({
        ...parsed,
        // 시간 초과는 에이전트가 과제를 못 끝낸 것이므로 무효가 아니라 실패로 센다.
        exit: timedOut || /print timeout/.test(parsed.error + stderr) ? "timeout" : parsed.exit,
        error: spawnError || parsed.error || stderr.slice(0, 500),
        durationMs: Date.now() - started,
      });
    };

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      log.write(chunk);
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => (stderr += chunk));
    child.on("error", (err) => finish(`Antigravity CLI를 실행할 수 없습니다 (${err.message}). AGY_BIN으로 경로를 지정하세요.`));
    child.on("close", () => finish());
  });
}
