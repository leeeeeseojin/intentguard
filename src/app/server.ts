import { readFile } from "node:fs/promises";
import path from "node:path";
import { Hono, type Context } from "hono";
import { BusyError, inputSchema, type AuditInput, type Audits } from "./audits.js";
import { agentOf } from "./models.js";

/** 이 PC에 설치·실행되는 조작 에이전트 */
export interface AgentStatus {
  ready: boolean;
  antigravity: boolean;
  claudeCode: boolean;
}

const AGENT_NAME = { antigravity: "Antigravity CLI(agy)", claudeCode: "Claude Code(claude)" } as const;

const TYPES: Record<string, string> = {
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};
const CSP = "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";

interface AppOptions {
  audits: Audits;
  port: number;
  /** 빌드된 화면 폴더 */
  ui: string;
  agent: () => AgentStatus;
}

/**
 * 이 서버는 내 PC에서 브라우저와 에이전트를 실행한다. 다른 웹페이지가 시키지 못해야 한다.
 * - Host: DNS 리바인딩 차단
 * - Origin·Sec-Fetch-Site·전용 헤더: 다른 페이지(다른 localhost 포트 포함)의 요청 차단
 */
export function createApp({ audits, port, ui, agent }: AppOptions): Hono {
  const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  const app = new Hono();

  app.use("*", async (c, next) => {
    const host = c.req.header("host") ?? "";
    if (!hosts.has(host)) return c.json({ error: "허용되지 않은 주소입니다." }, 403);
    if (c.req.path.startsWith("/api/")) {
      const site = c.req.header("sec-fetch-site");
      const origin = c.req.header("origin");
      if ((site && site !== "same-origin" && site !== "none") || (origin && origin !== `http://${host}`)) {
        return c.json({ error: "다른 페이지에서 온 요청입니다." }, 403);
      }
      if (c.req.method !== "GET" && (c.req.header("x-intentguard") !== "app" || !c.req.header("content-type")?.startsWith("application/json"))) {
        return c.json({ error: "검사 앱에서 보낸 요청이 아닙니다." }, 403);
      }
    }
    await next();
    c.header("content-security-policy", CSP);
    c.header("x-content-type-options", "nosniff");
    c.header("referrer-policy", "no-referrer");
    c.header("cache-control", "no-store");
  });

  app.get("/api/status", (c) => c.json(agent()));
  app.get("/api/audits", (c) => c.json(audits.list()));
  app.get("/api/audits/:id", (c) => {
    const audit = audits.get(c.req.param("id"));
    return audit ? c.json(audit) : c.json({ error: "검사 기록이 없습니다." }, 404);
  });

  const start = (c: Context, input: AuditInput, previous?: string) => {
    const status = agent();
    const missing = [...new Set(input.models.map(agentOf))].filter((a) => !status[a]);
    if (missing.length) return c.json({ error: `${missing.map((a) => AGENT_NAME[a]).join(", ")}를 찾을 수 없습니다. 설치하고 로그인한 뒤 앱을 다시 켜거나 다른 모델을 고르세요.` }, 503);
    try {
      return c.json(audits.start(input, previous), 201);
    } catch (err) {
      if (err instanceof BusyError) return c.json({ error: err.message }, 409);
      throw err;
    }
  };

  app.post("/api/audits", async (c) => {
    const parsed = inputSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "입력을 확인해 주세요." }, 400);
    // 검사받는 에이전트가 이 앱을 조작해 또 다른 검사를 시작하지 못하게 한다.
    const target = new URL(parsed.data.url);
    if (["localhost", "127.0.0.1", "[::1]", "0.0.0.0"].includes(target.hostname) && target.port === String(port)) {
      return c.json({ error: "검사 앱 자신은 검사할 수 없습니다." }, 400);
    }
    return start(c, parsed.data);
  });

  app.post("/api/audits/:id/rerun", (c) => {
    const before = audits.get(c.req.param("id"));
    return before ? start(c, before.input, before.id) : c.json({ error: "검사 기록이 없습니다." }, 404);
  });

  app.post("/api/audits/:id/cancel", async (c) =>
    (await audits.cancel(c.req.param("id"))) ? c.json({ ok: true }) : c.json({ error: "진행 중인 검사가 아닙니다." }, 409),
  );

  app.get("/api/audits/:id/screens/:index{[0-9]+}", async (c) => {
    const file = audits.screenshot(c.req.param("id"), Number(c.req.param("index")));
    const image = file && (await readFile(file).catch(() => null));
    return image ? c.body(new Uint8Array(image), 200, { "content-type": "image/png" }) : c.notFound();
  });

  app.get("/", async (c) => c.html(await readFile(path.join(ui, "index.html"), "utf8")));
  const file = async (c: Context, dir: string, name: string) => {
    const type = TYPES[path.extname(name)];
    const body = type && (await readFile(path.join(ui, dir, name)).catch(() => null));
    return body ? c.body(new Uint8Array(body), 200, { "content-type": type! }) : c.notFound();
  };
  app.get("/assets/:file{[A-Za-z0-9_.-]+}", (c) => file(c, "assets", c.req.param("file")));
  app.get("/evidence/:file{[0-9]+\\.png}", (c) => file(c, "evidence", c.req.param("file")));
  app.get("/chevron.svg", (c) => file(c, "", "chevron.svg"));

  return app;
}
