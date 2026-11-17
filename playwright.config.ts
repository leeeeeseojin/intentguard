import { defineConfig, devices } from "@playwright/test";

// 개발 서버(8787/5173)와 겹치지 않도록 E2E 전용 포트를 쓴다.
const API_PORT = 8788;
const WEB_PORT = 5174;

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
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
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
  ],
});
