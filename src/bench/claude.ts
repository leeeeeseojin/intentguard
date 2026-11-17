import { spawn, execFileSync } from "node:child_process";
import { createWriteStream, existsSync } from "node:fs";
import path from "node:path";
import type { RunRecord, ToolCall } from "./types.js";

export function resolveClaudeBin(): string {
  if (process.env.CLAUDE_BIN) return process.env.CLAUDE_BIN;
  if (process.platform === "win32" && process.env.APPDATA) {
    const exe = path.join(process.env.APPDATA, "npm/node_modules/@anthropic-ai/claude-code/bin/claude.exe");
    if (existsSync(exe)) return exe;
  }
  return "claude";
}

export interface ClaudeRunOptions {
  cwd: string;
  args: string[];
  prompt: string;
  timeoutMs: number;
  /** stream-json 원본을 저장할 경로 */
  rawLogPath: string;
}

export type ClaudeRunResult = Pick<
  RunRecord,
  "durationMs" | "exitReason" | "numTurns" | "costUsd" | "tokens" | "toolCalls" | "finalAnswer"
> & { model: string; permissionDenials: number };

interface ContentItem {
  type: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  is_error?: boolean;
  content?: string | { type: string; text?: string }[];
}

function textOf(content: ContentItem["content"]): string {
  if (typeof content === "string") return content;
  return (content ?? []).map((c) => c.text ?? "").join("\n");
}

function killTree(pid: number) {
  try {
    if (process.platform === "win32") execFileSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
    else process.kill(-pid, "SIGKILL");
  } catch {
    /* 이미 종료됨 */
  }
}

/** Claude Code를 헤드리스로 실행하고 stream-json 출력에서 도구 호출과 사용량을 뽑는다. */
export function runClaude(o: ClaudeRunOptions): Promise<ClaudeRunResult> {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(resolveClaudeBin(), o.args, { cwd: o.cwd, stdio: ["pipe", "pipe", "pipe"], detached: process.platform !== "win32" });
    const raw = createWriteStream(o.rawLogPath);
    const calls = new Map<string, ToolCall>();
    const order: string[] = [];
    let buffer = "";
    let final: Record<string, any> | null = null;
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      if (child.pid) killTree(child.pid);
    }, o.timeoutMs);

    const handleLine = (line: string) => {
      if (!line.trim()) return;
      raw.write(line + "\n");
      let msg: any;
      try {
        msg = JSON.parse(line);
      } catch {
        return;
      }
      const items: ContentItem[] = Array.isArray(msg.message?.content) ? msg.message.content : [];
      if (msg.type === "assistant") {
        for (const it of items) {
          if (it.type === "tool_use" && it.id) {
            calls.set(it.id, { name: it.name ?? "?", input: it.input, isError: false, resultPreview: "" });
            order.push(it.id);
          }
        }
      } else if (msg.type === "user") {
        for (const it of items) {
          if (it.type === "tool_result" && it.tool_use_id) {
            const call = calls.get(it.tool_use_id);
            if (call) {
              call.isError = !!it.is_error;
              call.resultPreview = textOf(it.content).slice(0, 400);
            }
          }
        }
      } else if (msg.type === "result") {
        final = msg;
      }
    };

    child.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      let idx: number;
      while ((idx = buffer.indexOf("\n")) >= 0) {
        handleLine(buffer.slice(0, idx));
        buffer = buffer.slice(idx + 1);
      }
    });
    child.stderr.on("data", (chunk: Buffer) => raw.write(JSON.stringify({ type: "stderr", text: chunk.toString("utf8") }) + "\n"));

    child.stdin.end(o.prompt);

    child.on("close", () => {
      clearTimeout(timer);
      handleLine(buffer);
      raw.end();
      const f = final as Record<string, any> | null;
      const usage = f?.usage ?? {};
      const subtype: string = f?.subtype ?? "";
      const exitReason: RunRecord["exitReason"] = timedOut
        ? "timeout"
        : /budget/i.test(subtype) || /budget/i.test(String(f?.result ?? ""))
          ? "budget"
          : f && !f.is_error
            ? "completed"
            : "error";
      resolve({
        durationMs: Date.now() - started,
        exitReason,
        numTurns: f?.num_turns ?? 0,
        costUsd: f?.total_cost_usd ?? 0,
        tokens: {
          input: usage.input_tokens ?? 0,
          cacheCreate: usage.cache_creation_input_tokens ?? 0,
          cacheRead: usage.cache_read_input_tokens ?? 0,
          output: usage.output_tokens ?? 0,
        },
        toolCalls: order.map((id) => calls.get(id)!),
        finalAnswer: typeof f?.result === "string" ? f.result : "",
        model: Object.keys(f?.modelUsage ?? {})[0] ?? "",
        permissionDenials: Array.isArray(f?.permission_denials) ? f.permission_denials.length : 0,
      });
    });
  });
}
