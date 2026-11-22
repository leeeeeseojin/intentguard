import { chromium, type BrowserContext, type Page, type Request } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
  });
}

export interface SharedBrowser {
  context: BrowserContext;
  cdpEndpoint: string;
  blocked: string[];
  /** 실패했거나 막힌 같은 출처의 쓰기 요청 */
  failedWrites: string[];
  close(): Promise<void>;
}

/**
 * 에이전트(CDP로 접속)와 채점기가 같은 브라우저를 쓴다. 채점은 에이전트의 말이 아니라 이 브라우저의 최종 상태로 한다.
 * - 다른 출처로의 화면 이동을 막는다.
 * - allowWrites가 아니면 GET·HEAD가 아닌 요청과 WebSocket을 막는다(남의 서비스를 실수로 바꾸지 않게).
 */
export async function openSharedBrowser(url: string, allowWrites = false): Promise<SharedBrowser> {
  const target = new URL(url);
  if (target.protocol !== "https:" && target.protocol !== "http:") throw new Error(`http(s) 주소만 검사할 수 있습니다: ${url}`);

  const port = await freePort();
  const profile = mkdtempSync(path.join(os.tmpdir(), "intentguard-browser-"));
  const context = await chromium.launchPersistentContext(profile, {
    headless: true,
    executablePath: process.env.PW_MCP_EXECUTABLE || undefined,
    viewport: { width: 1280, height: 800 },
    serviceWorkers: "block",
    args: [`--remote-debugging-port=${port}`, "--remote-debugging-address=127.0.0.1"],
  });

  const blocked: string[] = [];
  const failedWrites: string[] = [];
  const noteFailedWrite = (request: Request) => {
    const to = new URL(request.url());
    if (to.origin === target.origin && !["GET", "HEAD", "OPTIONS"].includes(request.method())) failedWrites.push(`${request.method()} ${to.pathname}`);
  };
  await context.route("**/*", (route) => {
    const request = route.request();
    const to = new URL(request.url());
    const write = !allowWrites && request.method() !== "GET" && request.method() !== "HEAD";
    const leaving = request.isNavigationRequest() && to.origin !== target.origin;
    if (!write && !leaving) return route.continue();
    blocked.push(`${request.method()} ${to.origin}${to.pathname}`);
    return route.abort("blockedbyclient");
  });
  context.on("requestfailed", noteFailedWrite);
  context.on("response", (response) => {
    if (response.status() >= 400) noteFailedWrite(response.request());
  });
  if (!allowWrites) await context.routeWebSocket(/.*/, (socket) => void socket.close());

  // 리다이렉트는 route를 다시 거치지 않으므로 도착한 주소로 한 번 더 막는다.
  const watch = (page: Page) =>
    page.on("framenavigated", (frame) => {
      if (frame !== page.mainFrame() || !/^https?:/.test(frame.url()) || new URL(frame.url()).origin === target.origin) return;
      blocked.push(`이동 ${new URL(frame.url()).origin}`);
      void page.goto("about:blank").catch(() => {});
    });
  context.pages().forEach(watch);
  context.on("page", watch);

  const close = async () => {
    await context.close();
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  };
  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(url);
  } catch (err) {
    await close();
    throw err;
  }
  return { context, cdpEndpoint: `http://127.0.0.1:${port}`, blocked, failedWrites, close };
}
