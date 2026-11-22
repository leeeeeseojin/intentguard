import { expect, test } from "@playwright/test";

const DEMO = "http://localhost:4174/";

test("검사 앱의 홈은 배포본의 서비스 설명을 하나도 빼지 않는다", async ({ page }) => {
  const explanation = async () => ({
    headings: await page.locator(".landing :is(h1, h2)").allInnerTexts(),
    // 검사 구간만 다르고 나머지 구간의 글은 같다.
    sections: await page.locator('.landing main > section:not([aria-labelledby="audit"])').allInnerTexts(),
  });
  await page.goto(DEMO);
  await expect(page.locator("#limits")).toBeVisible();
  const published = await explanation();
  await page.goto("/");
  await expect(page.locator("#limits")).toBeVisible();
  expect(await explanation()).toEqual(published);
  await expect(page.getByLabel("실제 검사 결과 예시")).toBeVisible();
});

test("홈의 검사 구간에 실행 안내 대신 바로 쓰는 검사 폼이 있다", async ({ page }) => {
  await page.goto("/#audit");
  const audit = page.locator('section[aria-labelledby="audit"]');
  await expect(audit.getByLabel("검사할 주소")).toBeVisible();
  await expect(audit.getByRole("button", { name: "검사 시작" })).toBeVisible();
  await expect(audit.getByLabel("검사 앱 켜기")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "내 사이트 검사하기" })).toBeInViewport();
});

test("실제 기록의 사진과 v1·v2 체험도 검사 앱에서 열린다", async ({ page }) => {
  await page.goto("/");
  const shot = page.locator(".evidence-shot img").first();
  await shot.scrollIntoViewIfNeeded();
  await expect.poll(() => shot.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1280);
  await page.getByRole("link", { name: "개선된 v2 체험" }).click();
  await expect(page.getByRole("rowheader", { name: "log-collector-prod" })).toBeVisible();
});

test("검사 앱의 홈은 모바일 390px에서 가로로 넘치지 않는다", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByLabel("검사할 주소")).toBeAttached();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
});
