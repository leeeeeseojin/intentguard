import { expect, test } from "./fixtures";

test("에이전트로 연 탭은 주소에서 actor를 지워도 스스로 승인할 수 없다", async ({ page, request }) => {
  await page.goto("/?ui=v2&actor=agent");
  await expect(page.getByRole("switch", { name: "에이전트 작업 일시정지" })).toBeVisible();
  await request.post("/api/buckets/bkt-1/public", { data: { public: true }, headers: { "x-actor": "agent" } });

  await page.goto("/?ui=v2");
  await page.getByRole("button", { name: /승인하고 실행/ }).click();
  await expect(page.getByRole("alert")).toContainText("에이전트는 스스로 승인");

  const { items } = await (await request.get("/api/buckets")).json();
  expect(items.find((b: { id: string }) => b.id === "bkt-1").public).toBe(false);
});
