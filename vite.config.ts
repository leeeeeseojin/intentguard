import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

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

export default defineConfig({
  root: "web",
  plugins: [react(), blockApiNavigation()],
  server: {
    port: Number(process.env.WEB_PORT ?? 5173),
    strictPort: true,
    proxy: { "/api": `http://localhost:${process.env.API_PORT ?? 8787}` },
  },
  build: { outDir: "../dist", emptyOutDir: true },
});
