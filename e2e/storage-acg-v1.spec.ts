import { expect, row, rowMenuButton, test } from "./fixtures";

test.describe("콘솔 v1 · Object Storage", () => {
  test("공개 토글을 누르면 확인 없이 바로 공개된다", async ({ page, request }) => {
    await page.goto("/#/storage");
    const toggle = row(page, "logs-prod").locator(".switch");
    await expect(toggle).not.toHaveClass(/on/);

    await toggle.click();
    await expect(toggle).toHaveClass(/on/);

    const { items } = await (await request.get("/api/buckets")).json();
    expect(items.find((b: { name: string }) => b.name === "logs-prod").public).toBe(true);
  });

  test("객체가 남은 버킷은 비운 뒤에만 삭제된다", async ({ page }) => {
    await page.goto("/#/storage");
    const target = row(page, "tmp-dev");

    await rowMenuButton(target).click();
    await page.getByText("버킷 삭제").click();
    await page.locator(".modal input").fill("tmp-dev");
    await page.getByRole("button", { name: "확인" }).click();
    await expect(page.locator(".toast-error")).toContainText("객체 37개가 남아 있습니다");

    await rowMenuButton(target).click();
    await page.getByText("버킷 비우기").click();
    await page.locator(".modal input").fill("tmp-dev");
    await page.getByRole("button", { name: "확인" }).click();
    await expect(page.locator(".toast-success")).toHaveText("버킷을 비웠습니다.");

    await rowMenuButton(target).click();
    await page.getByText("버킷 삭제").click();
    await page.locator(".modal input").fill("tmp-dev");
    await page.getByRole("button", { name: "확인" }).click();
    await expect(page.locator(".toast-success").last()).toHaveText("버킷을 삭제했습니다.");
  });
});

test.describe("콘솔 v1 · ACG", () => {
  test("보안 그룹에 인바운드 규칙을 추가한다", async ({ page }) => {
    await page.goto("/#/acg");
    await page.locator(".list-item", { hasText: "ssh-admin" }).click();
    await page.getByPlaceholder("포트").fill("8080");
    await page.getByPlaceholder("0.0.0.0/0").fill("10.0.0.0/16");
    await page.getByPlaceholder("메모").fill("내부 API");
    await page.getByRole("button", { name: "추가" }).click();

    await expect(page.locator(".toast-success")).toHaveText("규칙이 추가되었습니다.");
    await expect(row(page, "10.0.0.0/16")).toContainText("8080");
  });

  test("CIDR 형식이 아니면 오류 메시지만 잠깐 보인다", async ({ page }) => {
    await page.goto("/#/acg");
    await page.getByPlaceholder("포트").fill("22");
    await page.getByPlaceholder("0.0.0.0/0").fill("anywhere");
    await page.getByRole("button", { name: "추가" }).click();

    const error = page.locator(".toast-error");
    await expect(error).toContainText("접근 소스 형식이 올바르지 않습니다");
    await expect(error).not.toContainText("CIDR 형식"); // hint는 v1에서 버려진다
    await expect(error).toBeHidden({ timeout: 4000 });
  });
});
