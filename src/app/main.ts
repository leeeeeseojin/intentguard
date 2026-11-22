import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getRequestListener } from "@hono/node-server";
import { build } from "vite";
import { resolveAgy } from "../audit/antigravity.js";
import { Audits } from "./audits.js";
import { createApp } from "./server.js";

/**
 * 로컬 검사 앱. 입력부터 채점 결과, 재검사까지 한 화면에서 한다.
 *   pnpm exec tsx src/app/main.ts      → http://127.0.0.1:4717
 */
const root = fileURLToPath(new URL("../..", import.meta.url));
const port = Number(process.env.AUDIT_APP_PORT ?? 4717);
// 포트마다 따로 빌드해야 켜져 있는 앱의 화면을 E2E가 지우지 않는다.
const ui = path.join(root, `node_modules/.cache/intentguard-app-${port}`);

console.log("[app] 화면을 준비하는 중…");
await build({
  configFile: path.join(root, "vite.config.ts"),
  root: path.join(root, "web"),
  mode: "app",
  logLevel: "warn",
  build: { outDir: ui, emptyOutDir: true },
});

const ready = !spawnSync(resolveAgy(), ["--version"], { stdio: "ignore", timeout: 15_000 }).error;
const audits = new Audits(path.resolve(process.env.AUDIT_APP_DATA ?? path.join(root, ".intentguard/app")));
const app = createApp({ audits, port, ui, agent: () => ({ ready }) });
const server = createServer(getRequestListener(app.fetch));

server.once("error", (err) => {
  console.error(`[app] ${port}번 포트를 열 수 없습니다: ${err.message}`);
  process.exit(1);
});
server.listen(port, "127.0.0.1", () => {
  console.log(`[app] 검사 앱: http://127.0.0.1:${port}`);
  if (!ready) console.log("[app] Antigravity CLI(agy)가 없어 검사를 시작할 수 없습니다.");
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => void audits.close().finally(() => process.exit(0)));
}
