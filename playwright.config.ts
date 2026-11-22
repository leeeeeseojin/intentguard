import { defineConfig, devices } from "@playwright/test";

// 개발 서버(8787/5173)와 겹치지 않도록 E2E 전용 포트를 쓴다.
const API_PORT = 8788;
const WEB_PORT = 5174;
const DEMO_PORT = 4174;
const DEMO_DIR = "../node_modules/.cache/intentguard-demo";

export default defineConfig({
  testDir: "e2e",
  // MiniCloud는 서버 하나의 인메모리 상태를 공유하므로 테스트를 순서대로 실행한다.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", testIgnore: ["demo.spec.ts", "audit.spec.ts"], use: { ...devices["Desktop Chrome"] } },
    { name: "demo", testMatch: ["demo.spec.ts", "audit.spec.ts"], use: { ...devices["Desktop Chrome"], baseURL: `http://localhost:${DEMO_PORT}` } },
  ],
  webServer: [
    {
      command: "pnpm start:api",
      url: `http://localhost:${API_PORT}/api/buckets`,
      env: { PORT: String(API_PORT), TRANSITION_DELAY_MS: "300" },
      reuseExistingServer: false,
    },
    {
      command: "pnpm dev:web",
      url: `http://localhost:${WEB_PORT}`,
      env: { WEB_PORT: String(WEB_PORT), API_PORT: String(API_PORT) },
      reuseExistingServer: false,
    },
    {
      // Vercel과 같은 demo 모드 빌드를 API 서버·프록시 없이 서빙한다.
      command: `pnpm exec vite build --mode demo --outDir ${DEMO_DIR} && pnpm exec vite preview --mode demo --outDir ${DEMO_DIR} --port ${DEMO_PORT} --strictPort`,
      url: `http://localhost:${DEMO_PORT}`,
      reuseExistingServer: false,
    },
  ],
});
