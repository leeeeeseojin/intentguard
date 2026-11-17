import { expect, test } from "./fixtures";

/**
 * v2 테스트는 CSS 클래스 없이 role·label만으로 요소를 찾는다.
 * v1 테스트가 위치와 클래스에 의존해야 했던 것과 대비된다 — 에이전트가 읽는 접근성 트리와 같은 정보다.
 */

const serverRow = (page: import("@playwright/test").Page, name: string) =>
  page.getByRole("table", { name: "서버 목록" }).getByRole("row").filter({ has: page.getByRole("rowheader", { name, exact: true }) });

test.describe("콘솔 v2 · 서버", () => {
  test("검색과 환경 필터로 서버를 찾고 환경을 텍스트로 확인한다", async ({ page }) => {
    await page.goto("/?ui=v2");
    await page.getByLabel("서버 이름 검색").fill("api-server");
    await page.getByLabel("환경").selectOption("dev");

    const rows = page.getByRole("table", { name: "서버 목록" }).getByRole("rowheader");
    await expect(rows).toHaveText(["api-server-dev-old", "api-server-dev"]);
    await expect(serverRow(page, "api-server-dev")).toContainText("dev (개발)");
    await expect(page).toHaveURL(/q=api-server/);
  });

  test("실행 중인 서버는 삭제가 이유와 함께 비활성화되고, 정지하면 자동 갱신 후 삭제할 수 있다", async ({ page }) => {
    await page.goto("/?ui=v2");
    await page.getByLabel("서버 이름 검색").fill("api-server-dev");
    const row = serverRow(page, "api-server-dev");

    await row.getByRole("button", { name: "api-server-dev 작업", exact: true }).click();
    const del = page.getByRole("menuitem", { name: /서버 삭제/ });
    await expect(del).toHaveAttribute("aria-disabled", "true");
    await expect(del).toContainText("먼저 서버를 정지해야 삭제할 수 있습니다");

    await page.getByRole("menuitem", { name: "서버 정지" }).click();
    await expect(page.getByRole("status", { name: "최근 작업 결과" })).toContainText("api-server-dev 정지를 요청했습니다");
    // 새로고침 버튼을 누르지 않아도 전이 상태가 끝날 때까지 자동 갱신된다.
    await expect(row).toContainText("정지됨 (stopped)");

    await row.getByRole("button", { name: "api-server-dev 작업", exact: true }).click();
    await page.getByRole("menuitem", { name: "서버 삭제" }).click();
    const dialog = page.getByRole("dialog", { name: "api-server-dev 서버 삭제" });
    await dialog.getByLabel("확인을 위해 이름 api-server-dev 을(를) 입력하세요").fill("api-server-dev");
    await dialog.getByRole("button", { name: "api-server-dev 서버 삭제" }).click();

    await expect(row).toHaveCount(0);
    await expect(page.getByRole("rowheader", { name: "api-server-dev-old" })).toBeVisible();
  });

  test("서버 생성 폼은 이름 규칙을 즉시 알려주고, 만든 서버는 맨 위에 자동으로 나타난다", async ({ page }) => {
    await page.goto("/?ui=v2");
    await page.getByRole("button", { name: "서버 생성" }).click();
    const dialog = page.getByRole("dialog", { name: "서버 생성" });

    await dialog.getByLabel("서버 이름").fill("My Server");
    await expect(dialog.getByText(/이름 규칙에 맞지 않습니다/)).toBeVisible();
    await expect(dialog.getByRole("button", { name: "서버 생성" })).toBeDisabled();
    await expect(dialog.getByText("입력 필요: 올바른 서버 이름, 환경, 사양")).toBeVisible();

    await dialog.getByLabel("서버 이름").fill("my-server-dev");
    await dialog.getByRole("radio", { name: "dev (개발)" }).check();
    await dialog.getByRole("radio", { name: /micro/ }).check();
    await dialog.getByRole("button", { name: "서버 생성" }).click();

    await expect(dialog).toHaveCount(0);
    const first = page.getByRole("table", { name: "서버 목록" }).getByRole("rowheader").first();
    await expect(first).toHaveText("my-server-dev");
    await expect(serverRow(page, "my-server-dev")).toContainText("실행 중 (running)");
  });
});

test.describe("콘솔 v2 · 버킷", () => {
  test("공개 스위치는 상태를 노출하고, 객체가 남은 버킷은 비운 뒤에 삭제할 수 있다", async ({ page }) => {
    await page.goto("/?ui=v2#/storage");
    await expect(page.getByRole("switch", { name: "assets-prod 외부 공개" })).toHaveAttribute("aria-checked", "true");
    await page.getByRole("switch", { name: "assets-prod 외부 공개" }).click();
    await expect(page.getByRole("switch", { name: "assets-prod 외부 공개" })).toHaveAttribute("aria-checked", "false");

    await page.getByRole("button", { name: "tmp-dev 작업", exact: true }).click();
    await expect(page.getByRole("menuitem", { name: /버킷 삭제/ })).toContainText("객체 37개가 남아 있어 먼저 비워야 합니다");
    await page.getByRole("menuitem", { name: "버킷 비우기" }).click();
    const dialog = page.getByRole("dialog", { name: "tmp-dev 버킷 비우기" });
    await dialog.getByLabel(/확인을 위해 이름 tmp-dev/).fill("tmp-dev");
    await dialog.getByRole("button", { name: "tmp-dev 버킷 비우기" }).click();
    await expect(page.getByRole("status", { name: "최근 작업 결과" })).toContainText("이제 삭제할 수 있습니다");

    await page.getByRole("button", { name: "tmp-dev 작업", exact: true }).click();
    await page.getByRole("menuitem", { name: "버킷 삭제" }).click();
    await page.getByRole("dialog").getByLabel(/확인을 위해 이름 tmp-dev/).fill("tmp-dev");
    await page.getByRole("dialog").getByRole("button", { name: "tmp-dev 버킷 삭제" }).click();
    await expect(page.getByRole("rowheader", { name: "tmp-dev" })).toHaveCount(0);
  });
});

test.describe("IntentGuard · 사람 승인", () => {
  const agentRequest = (request: import("@playwright/test").APIRequestContext, path: string, data: unknown, reason: string) =>
    request.post(path, { data, headers: { "x-actor": "agent", "x-agent-reason": encodeURIComponent(reason) } });

  test("에이전트의 위험 작업은 패널에서 이유와 함께 승인을 기다리고, 승인하면 실행되어 화면이 갱신된다", async ({ page, request }) => {
    await page.goto("/?ui=v2#/storage");
    const res = await agentRequest(request, "/api/buckets/bkt-1/public", { public: true }, "외부 파트너에게 로그 공유");
    expect(res.status()).toBe(202);

    const card = page.getByRole("article", { name: /승인 요청 apv-1/ });
    await expect(card).toContainText("버킷 logs-prod을(를) 공개로 변경");
    await expect(card).toContainText("위험: 버킷의 모든 객체를 인터넷에 공개");
    await expect(card).toContainText("에이전트가 밝힌 이유: 외부 파트너에게 로그 공유");
    await expect(page.getByRole("switch", { name: "logs-prod 외부 공개" })).toHaveAttribute("aria-checked", "false");

    await card.getByRole("button", { name: /승인하고 실행/ }).click();
    await expect(page.getByRole("region", { name: "최근 결정" })).toContainText("승인·실행됨");
    await expect(page.getByRole("switch", { name: "logs-prod 외부 공개" })).toHaveAttribute("aria-checked", "true");
  });

  test("거절 사유는 에이전트에게 전달되고 작업은 실행되지 않는다", async ({ page, request }) => {
    await page.goto("/?ui=v2");
    await agentRequest(request, "/api/security-groups/sg-ssh/rules", { protocol: "tcp", port: 22, source: "0.0.0.0/0" }, "원격 접속");

    const card = page.getByRole("article", { name: /승인 요청 apv-1/ });
    await expect(card).toContainText("SSH(22) 포트를 인터넷 전체에 공개");
    await card.getByLabel("거절 사유 (선택, 에이전트에게 전달)").fill("VPN으로 접속하세요");
    await card.getByRole("button", { name: "거절" }).click();

    const approval = await (await request.get("/api/approvals/apv-1")).json();
    expect(approval).toMatchObject({ status: "rejected", note: "VPN으로 접속하세요" });
    const sg = await (await request.get("/api/security-groups/sg-ssh")).json();
    expect(sg.rules.filter((r: { source: string }) => r.source === "0.0.0.0/0")).toHaveLength(0);
  });

  test("일시정지하면 에이전트의 변경은 거부되고 패널에 상태가 표시된다", async ({ page, request }) => {
    await page.goto("/?ui=v2");
    await page.getByRole("switch", { name: "에이전트 작업 일시정지" }).click();
    await expect(page.getByRole("switch", { name: "에이전트 작업 일시정지" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByText("일시정지됨: 에이전트의 모든 변경 요청이 거부됩니다.")).toBeVisible();

    const res = await request.post("/api/instances/srv-0008/stop", { headers: { "x-actor": "agent" } });
    expect(res.status()).toBe(423);
  });
});
