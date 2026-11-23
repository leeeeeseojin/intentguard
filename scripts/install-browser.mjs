// Web 경로 에이전트용 headless 브라우저를 프로젝트 안(.pw-browsers)에 설치한다.
// AppData 접근이 막힌 터미널에서도 벤치마크가 브라우저를 찾을 수 있게 하기 위해서다.
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Playwright MCP가 쓰는 playwright 버전에 맞는 브라우저를 설치한다.
// pnpm은 node_modules를 심볼릭 링크로 두므로 실제 경로 기준으로 의존성을 찾는다.
const mcpPkg = realpathSync(path.join(root, "node_modules/@playwright/mcp/package.json"));
const require = createRequire(mcpPkg);
const cli = path.join(path.dirname(require.resolve("playwright/package.json")), "cli.js");

execFileSync(process.execPath, [cli, "install", "--only-shell", "chromium"], {
  stdio: "inherit",
  env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: path.join(root, ".pw-browsers") },
});
