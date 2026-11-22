import { expect, test as base } from "@playwright/test";

// 서버 없이 정적 파일만 서빙한 배포본을 검사한다. /api 요청, 콘솔 오류, CSP 위반이 하나라도 있으면 실패.
const test = base.extend<{ cleanStaticSite: void }>({
  cleanStaticSite: [
    async ({ page }, use) => {
      const problems: string[] = [];
      page.on("request", (r) => {
        if (new URL(r.url()).pathname.startsWith("/api")) problems.push(`API 요청: ${r.url()}`);
      });
      page.on("pageerror", (e) => problems.push(e.message));
      page.on("console", (m) => {
        // 브라우저 안 API의 실패 응답은 네트워크 오류로 남지 않으므로 console error는 전부 문제다.
        if (m.type() === "error") problems.push(m.text());
      });
      await use();
      expect(problems).toEqual([]);
    },
    { auto: true },
  ],
});

const serverRow = (page: import("@playwright/test").Page, name: string) =>
  page.getByRole("row").filter({ has: page.getByRole("rowheader", { name, exact: true }) });

async function stopServer(page: import("@playwright/test").Page, name: string) {
  await page.getByRole("button", { name: `${name} 작업`, exact: true }).click();
  await page.getByRole("menuitem", { name: "서버 정지", exact: true }).click();
}

test("소개 화면은 정정된 수치를 보여주고 콘솔로 이어진다", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("어디서 실패할까");
  const row = page.getByRole("region", { name: "경로별 결과 표" }).getByRole("row", { name: /확인된 성공률/ });
  await expect(row.getByRole("cell")).toHaveText(["53% (16/30)", "100% (30/30)", "73% (22/30)"]);
  await page.getByRole("link", { name: "개선된 v2 체험" }).click();
  await expect(page.getByRole("rowheader", { name: "log-collector-prod" })).toBeVisible();
});

test("v1은 서버 없이 동작하고 새로고침 전까지 목록이 그대로인 특성도 유지한다", async ({ page }) => {
  await page.goto("/?ui=v1");
  const row = page.locator("tbody tr").filter({ has: page.getByText("db-dev", { exact: true }) });
  await row.locator(".row-menu > button").click();
  await page.getByText("서버 정지").click();
  await expect(page.locator(".toast-success")).toBeVisible();
  await expect(row).toContainText("운영중");
  await page.waitForTimeout(1800);
  await page.locator(".page-header .icon-btn").first().click();
  await expect(row.locator(".status-stopped")).toBeVisible();
});

test("변경은 새로고침해도 남고 다른 방문자에게는 보이지 않는다", async ({ page, browser, baseURL }) => {
  await page.goto("/?ui=v2");
  await stopServer(page, "ml-notebook-dev");
  await expect(serverRow(page, "ml-notebook-dev")).toContainText("정지됨 (stopped)");
  await page.reload();
  await expect(serverRow(page, "ml-notebook-dev")).toContainText("정지됨 (stopped)");

  const context = await browser.newContext({ baseURL });
  const visitor = await context.newPage();
  await visitor.goto("/?ui=v2");
  await expect(serverRow(visitor, "ml-notebook-dev")).toContainText("실행 중 (running)");
  await context.close();
});

test("정지 중에 새로고침해도 정지가 끝난다", async ({ page }) => {
  await page.goto("/?ui=v2");
  await stopServer(page, "ml-notebook-dev");
  await page.reload();
  await expect(serverRow(page, "ml-notebook-dev")).toContainText("정지됨 (stopped)");
});

test("위험 요청은 새로고침 뒤에도 승인을 기다리고, 승인하면 실행되고, 초기화된다", async ({ page }) => {
  await page.goto("/?ui=v2#/storage");
  await page.getByLabel("체험할 에이전트 요청").selectOption("publish");
  await page.getByRole("button", { name: "에이전트 요청 보내기" }).click();
  await expect(page.getByRole("status", { name: "데모 안내" })).toContainText("승인 대기");

  const publicSwitch = page.getByRole("switch", { name: "logs-prod 외부 공개" });
  await expect(publicSwitch).toHaveAttribute("aria-checked", "false");
  await page.reload();
  await page.getByRole("button", { name: /승인하고 실행/ }).click();
  await expect(publicSwitch).toHaveAttribute("aria-checked", "true");

  await page.getByRole("button", { name: "데모 초기화" }).click();
  await expect(publicSwitch).toHaveAttribute("aria-checked", "false");
});

test("에이전트로 연 탭에는 데모 도구가 없고 자가 승인도 할 수 없다", async ({ page }) => {
  await page.goto("/?ui=v2&actor=agent");
  await stopServer(page, "log-collector-prod");
  const approve = page.getByRole("button", { name: /승인하고 실행/ });
  await expect(approve).toBeVisible();
  await expect(page.getByRole("complementary", { name: "데모 도구" })).toHaveCount(0);

  await page.goto("/?ui=v2");
  await expect(page.getByRole("complementary", { name: "데모 도구" })).toHaveCount(0);
  await approve.click();
  await expect(page.getByRole("alert")).toContainText("에이전트는 스스로 승인");
});

test("저장된 상태가 깨져 있으면 시드 데이터로 시작한다", async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("intentguard.demo.v1", "{broken"));
  await page.goto("/?ui=v2");
  await expect(page.getByRole("rowheader", { name: "log-collector-prod" })).toBeVisible();
});

for (const path of ["/", "/?ui=v2", "/?ui=v2#/storage", "/?ui=v2#/acg"]) {
  test(`모바일 390px에서 페이지가 가로로 넘치지 않는다: ${path}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(path);
    await expect(page.locator("h1").first()).toBeVisible();
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });
}
