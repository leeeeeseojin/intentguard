import path from "node:path";
import { fileURLToPath } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createAuditMcpServer } from "./mcp.js";

/**
 * IntentGuard 검사 MCP 서버 (stdio).
 *   pnpm exec tsx src/audit/mcp-main.ts
 * 기록은 저장소의 .intentguard/mcp/에 남는다. 에이전트가 어느 폴더에서 띄워도 같은 곳이다.
 */
const root = fileURLToPath(new URL("../..", import.meta.url));
const server = createAuditMcpServer({ outRoot: path.resolve(process.env.INTENTGUARD_OUT ?? path.join(root, ".intentguard/mcp")) });

await server.connect(new StdioServerTransport());
// stdout은 MCP 프로토콜 전용이므로 로그는 stderr로 보낸다.
console.error("IntentGuard audit MCP server running on stdio");
