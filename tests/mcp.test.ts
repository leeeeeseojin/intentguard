import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { beforeEach, describe, expect, it } from "vitest";
import { MiniCloud } from "../src/domain/store.js";
import { createApiClient } from "../src/mcp/client.js";
import { createMcpServer } from "../src/mcp/server.js";
import { createApp } from "../src/server/app.js";

async function connect() {
  const cloud = new MiniCloud({ transitionDelayMs: 0 });
  const app = createApp(cloud);
  const api = createApiClient({ baseUrl: "http://test", fetch: (url, init) => Promise.resolve(app.request(url, init)) });
  const server = createMcpServer(api);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, cloud };
}

const text = (r: unknown) => ((r as CallToolResult).content[0] as { text: string }).text;

describe("MiniCloud MCP 서버", () => {
  let ctx: Awaited<ReturnType<typeof connect>>;
  beforeEach(async () => {
    ctx = await connect();
  });

  it("도구 목록과 destructive annotation을 노출한다", async () => {
    const { tools } = await ctx.client.listTools();
    const del = tools.find((t) => t.name === "delete_instance");
    expect(tools.length).toBe(13);
    expect(del?.annotations?.destructiveHint).toBe(true);
    expect(tools.find((t) => t.name === "list_instances")?.annotations?.readOnlyHint).toBe(true);
  });

  it("이름으로 서버를 찾는다", async () => {
    const r = await ctx.client.callTool({ name: "list_instances", arguments: { env: "dev", name_contains: "api-server" } });
    const { items } = JSON.parse(text(r));
    expect(items.map((i: { name: string }) => i.name)).toEqual(["api-server-dev", "api-server-dev-old"]);
  });

  it("실패하면 isError와 다음 행동 hint를 돌려준다", async () => {
    const r = (await ctx.client.callTool({ name: "delete_instance", arguments: { id: "srv-0008" } })) as CallToolResult;
    expect(r.isError).toBe(true);
    expect(text(r)).toContain("[INVALID_STATE]");
    expect(text(r)).toContain("다음 행동:");
  });

  it("MCP로 수행한 작업은 agent로 감사 로그에 남는다", async () => {
    await ctx.client.callTool({ name: "stop_instance", arguments: { id: "srv-0008" } });
    await ctx.client.callTool({ name: "delete_instance", arguments: { id: "srv-0008" } });
    expect(ctx.cloud.getAudit().map((a) => [a.actor, a.action, a.ok])).toEqual([
      ["agent", "instance.stop", true],
      ["agent", "instance.delete", true],
    ]);
  });
});
