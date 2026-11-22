import { expect, test } from "./fixtures";

// 벤치마크 add-firewall-rule v2 3/3에서 감독 패널이 "규칙 추가" 버튼을 가렸던 회귀를 막는다.
for (const width of [1024, 1101, 1280, 1440, 1920]) {
  test(`v2 보안 그룹 폼은 ${width}px에서 감독 패널에 가리지 않는다`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/?ui=v2#/acg");
    await page.getByText("ssh-admin").first().click();
    await page.getByLabel("포트").fill("8080");
    await page.getByLabel("접근 허용 대역 (CIDR)").fill("10.0.0.0/16");

    const overflow = await page.locator(".rule-form-v2").evaluate((form) => {
      const main = form.closest("main")!;
      const right = Math.max(...[form, ...form.querySelectorAll("*")].map((el) => el.getBoundingClientRect().right));
      return right - main.getBoundingClientRect().right;
    });
    expect(overflow).toBeLessThanOrEqual(0);
    await page.getByRole("button", { name: "규칙 추가", exact: true }).click({ timeout: 3000 });
    await expect(page.getByRole("status", { name: "최근 작업 결과" })).toContainText("8080");
  });
}
