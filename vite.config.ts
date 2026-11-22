import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { summarize } from "./src/bench/summary";

const root = fileURLToPath(new URL(".", import.meta.url));

/** 소개 화면의 수치를 실행 기록에서 빌드 시점에 계산한다. */
function benchSummary(): Plugin {
  const id = "virtual:bench-summary";
  return {
    name: "bench-summary",
    resolveId: (source) => (source === id ? `\0${id}` : null),
    load: (resolved) => (resolved === `\0${id}` ? `export default ${JSON.stringify(summarize(root))}` : null),
  };
}

/** 로컬 미리보기에도 배포와 같은 보안 헤더를 건다. */
function deployHeaders(): Record<string, string> {
  const config = JSON.parse(readFileSync(new URL("./vercel.json", import.meta.url), "utf8")) as {
    headers: { headers: { key: string; value: string }[] }[];
  };
  return Object.fromEntries(config.headers.flatMap((h) => h.headers.map(({ key, value }) => [key, value])));
}

/**
 * 브라우저 주소창으로 /api/* 를 직접 여는 요청(top-level navigation)을 막는다.
 * 에이전트가 콘솔 화면 대신 API JSON을 읽어 Web 경로 실험을 우회하지 못하게 하기 위해서다.
 * 콘솔의 fetch 요청과 Playwright request 픽스처는 navigation이 아니므로 영향이 없다.
 */
function blockApiNavigation(): Plugin {
  return {
    name: "block-api-navigation",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.startsWith("/api") && req.headers["sec-fetch-mode"] === "navigate") {
          res.statusCode = 403;
          res.setHeader("content-type", "application/json; charset=utf-8");
          res.end(JSON.stringify({ error: { code: "UI_ONLY", message: "API를 직접 열 수 없습니다. 콘솔 화면을 사용하세요." } }));
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  root: "web",
  plugins: [react(), blockApiNavigation(), benchSummary()],
  server: {
    port: Number(process.env.WEB_PORT ?? 5173),
    strictPort: true,
    // 데모는 서버 없이 돌아야 하므로 프록시를 두지 않는다.
    proxy: mode === "demo" ? undefined : { "/api": `http://localhost:${process.env.API_PORT ?? 8787}` },
  },
  preview: mode === "demo" ? { headers: deployHeaders() } : undefined,
  build: { outDir: "../dist", emptyOutDir: true },
}));
