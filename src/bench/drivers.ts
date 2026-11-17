import { existsSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

function playwrightBrowsersDir(): string {
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) return process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (process.platform === "win32") return path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright");
  if (process.platform === "darwin") return path.join(os.homedir(), "Library/Caches/ms-playwright");
  return path.join(os.homedir(), ".cache/ms-playwright");
}

/**
 * 일부 Windows 환경에서는 전체 Chromium이 실행되지 않는다(side-by-side 설정 오류).
 * Playwright Test가 headless에서 쓰는 chrome-headless-shell은 동작하므로 가장 최신 것을 지정한다.
 * PW_MCP_EXECUTABLE로 직접 지정할 수도 있다.
 */
function executableArgs(): string[] {
  if (process.env.PW_MCP_EXECUTABLE) return ["--executable-path", process.env.PW_MCP_EXECUTABLE];
  const dir = playwrightBrowsersDir();
  if (!existsSync(dir)) return [];
  const shells = readdirSync(dir)
    .filter((d) => d.startsWith("chromium_headless_shell-"))
    .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));
  for (const shell of shells) {
    const sub = process.platform === "win32" ? "chrome-headless-shell-win64/chrome-headless-shell.exe" : "chrome-headless-shell-linux64/chrome-headless-shell";
    const exe = path.join(dir, shell, sub);
    if (existsSync(exe)) return ["--executable-path", exe];
  }
  return [];
}
import type { DriverName } from "./types.js";

export interface DriverOptions {
  repoRoot: string;
  apiUrl: string;
  webUrl: string;
  ui: "v1" | "v2";
  /** Playwright MCP가 파일을 쓸 작업 폴더 */
  workDir: string;
}

export interface DriverSetup {
  mcpConfig: { mcpServers: Record<string, { command: string; args: string[]; env?: Record<string, string> }> };
  allowedTools: string[];
  disallowedTools: string[];
  buildPrompt: (request: string) => string;
}

const WEB_ALLOWED = [
  "browser_navigate",
  "browser_navigate_back",
  "browser_snapshot",
  "browser_click",
  "browser_type",
  "browser_fill_form",
  "browser_select_option",
  "browser_press_key",
  "browser_hover",
  "browser_drag",
  "browser_handle_dialog",
  "browser_wait_for",
  "browser_find",
  "browser_tabs",
  "browser_console_messages",
  "browser_resize",
  "browser_close",
];

const WEB_BLOCKED = [
  "browser_evaluate",
  "browser_run_code_unsafe",
  "browser_network_requests",
  "browser_network_request",
  "browser_file_upload",
  "browser_drop",
  "browser_take_screenshot",
  "browser_emulate_media",
];

const FOOTER ="작업이 끝나면 무엇을 했고 결과가 어떤지 한두 문장으로 보고해.";

/**
 * 두 경로는 같은 요청 문장을 받고, 사용할 수 있는 인터페이스만 다르다.
 * 어느 쪽에도 셸·파일 같은 내장 도구는 주지 않는다 (--tools "").
 */
export function setupDriver(driver: DriverName, o: DriverOptions): DriverSetup {
  const node = process.execPath;

  if (driver === "mcp") {
    return {
      mcpConfig: {
        mcpServers: {
          minicloud: {
            command: node,
            args: [path.join(o.repoRoot, "node_modules/tsx/dist/cli.mjs"), path.join(o.repoRoot, "src/mcp/index.ts")],
            env: { MINICLOUD_URL: o.apiUrl },
          },
        },
      },
      allowedTools: ["mcp__minicloud"],
      disallowedTools: [],
      buildPrompt: (request) =>
        `너는 사용자를 대신해 클라우드 서비스 MiniCloud를 조작하는 에이전트야. 연결된 minicloud 도구를 사용해서 아래 요청을 처리해. ${FOOTER}\n\n요청: ${request}`,
    };
  }

  const url = `${o.webUrl}/?actor=agent&ui=${o.ui}`;
  return {
    mcpConfig: {
      mcpServers: {
        playwright: {
          command: node,
          args: [
            path.join(o.repoRoot, "node_modules/@playwright/mcp/cli.js"),
            "--headless",
            "--isolated",
            "--browser",
            "chromium",
            "--image-responses",
            "omit",
            "--viewport-size",
            "1280,800",
            "--output-dir",
            path.join(o.workDir, "pw-out"),
            ...executableArgs(),
          ],
        },
      },
    },
    // 사람이 화면에서 할 수 있는 조작만 허용한다 (허용 목록 방식).
    allowedTools: WEB_ALLOWED.map((t) => `mcp__playwright__${t}`),
    // 페이지 안에서 JS를 실행하거나 네트워크를 엿보면 화면을 거치지 않고 API를 쓸 수 있으므로 막는다.
    // 스크린샷도 막아 접근성 스냅샷(텍스트)만으로 화면을 읽게 한다.
    disallowedTools: WEB_BLOCKED.map((t) => `mcp__playwright__${t}`),
    buildPrompt: (request) =>
      `너는 사용자를 대신해 클라우드 서비스 MiniCloud를 조작하는 에이전트야. 브라우저 도구로 MiniCloud 웹 콘솔(${url})을 열어서 화면을 조작해 아래 요청을 처리해. ${FOOTER}\n\n요청: ${request}`,
  };
}
