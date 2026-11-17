import { expect, refreshButton, row, rowMenuButton, test } from "./fixtures";

test.describe("콘솔 v1 · Server", () => {
  test("서버 목록은 페이지당 10개이고 최근 서버는 2페이지에 있다", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("tbody tr")).toHaveCount(10);
    await expect(row(page, "test-runner-dev")).toHaveCount(0);

    await page.getByRole("button", { name: "2", exact: true }).click();
    await expect(row(page, "test-runner-dev")).toBeVisible();
  });

  test("마법사로 서버를 만들면 새로고침 후에야 목록에 나타난다", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "서버 생성" }).click();

    const next = page.getByRole("button", { name: "다음" });
    await expect(next).toBeDisabled();

    // 1단계: 라벨이 없어 placeholder로 찾는다. 환경 선택은 div라서 텍스트로 클릭한다.
    await page.getByPlaceholder("서버 이름").fill("e2e-app-dev");
    await page.locator(".chip", { hasText: "개발" }).click();
    await next.click();

    // 2단계: 사양 카드
    await page.locator(".spec-card", { hasText: "micro" }).click();
    await next.click();

    // 3단계: 네트워크 → 생성
    await page.getByRole("button", { name: "생성", exact: true }).click();
    await expect(page.locator(".toast-success")).toHaveText("서버 생성 요청이 완료되었습니다.");

    // stale-list: 목록은 자동으로 갱신되지 않는다.
    await page.getByRole("button", { name: "2", exact: true }).click();
    await expect(row(page, "e2e-app-dev")).toHaveCount(0);

    await refreshButton(page).click();
    await page.getByRole("button", { name: "2", exact: true }).click();
    await expect(row(page, "e2e-app-dev")).toBeVisible();
  });

  test("잘못된 이름은 마지막 단계에서야 거부되고 오류는 곧 사라진다", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "서버 생성" }).click();
    await page.getByPlaceholder("서버 이름").fill("My Server");
    await page.locator(".chip", { hasText: "개발" }).click();
    await page.getByRole("button", { name: "다음" }).click();
    await page.locator(".spec-card", { hasText: "micro" }).click();
    await page.getByRole("button", { name: "다음" }).click();
    await page.getByRole("button", { name: "생성", exact: true }).click();

    const error = page.locator(".toast-error");
    await expect(error).toHaveText("서버 이름 형식이 올바르지 않습니다.");
    await expect(error).toBeHidden({ timeout: 4000 });
  });

  test("실행 중인 서버는 반납이 실패하고, 정지 후에는 반납된다", async ({ page }) => {
    await page.goto("/");
    const target = row(page, "api-server-dev");

    // 실행 중 → 반납 시도 → 실패
    await rowMenuButton(target).click();
    await page.getByText("서버 반납").click();
    const confirm = page.getByRole("button", { name: "확인" });
    await expect(confirm).toBeDisabled();
    await page.locator(".modal input").fill("api-server-dev");
    await confirm.click();
    await expect(page.locator(".toast-error")).toContainText("정지 상태가 아니라 삭제할 수 없습니다");

    // 정지 → 상태 전이를 새로고침으로 확인
    await rowMenuButton(target).click();
    await page.getByText("서버 정지").click();
    await expect(async () => {
      await refreshButton(page).click();
      await expect(target.locator(".status")).toHaveText("정지", { timeout: 500 });
    }).toPass({ timeout: 5000 });

    // 반납
    await rowMenuButton(target).click();
    await page.getByText("서버 반납").click();
    await page.locator(".modal input").fill("api-server-dev");
    await page.getByRole("button", { name: "확인" }).click();
    await expect(page.locator(".toast-success").last()).toHaveText("서버 반납을 요청했습니다.");

    await expect(async () => {
      await refreshButton(page).click();
      await expect(target).toHaveCount(0, { timeout: 500 });
    }).toPass({ timeout: 5000 });
  });

  test("콘솔에서 한 작업은 human으로 감사 로그에 남는다", async ({ page, request }) => {
    await page.goto("/");
    await rowMenuButton(row(page, "db-dev")).click();
    await page.getByText("서버 정지").click();
    await expect(page.locator(".toast-success")).toBeVisible();

    const audit = await (await request.get("/api/_audit")).json();
    expect(audit.items).toEqual([expect.objectContaining({ actor: "human", action: "instance.stop", ok: true })]);
  });
});
