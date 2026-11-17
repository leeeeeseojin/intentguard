import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createApiClient } from "./client.js";
import { createMcpServer } from "./server.js";

const api = createApiClient({ baseUrl: process.env.MINICLOUD_URL ?? "http://localhost:8787", actor: "agent" });
const server = createMcpServer(api);

await server.connect(new StdioServerTransport());
// stdout은 MCP 프로토콜 전용이므로 로그는 stderr로 보낸다.
console.error("MiniCloud MCP server running on stdio");
