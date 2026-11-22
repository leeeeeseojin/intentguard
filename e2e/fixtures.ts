import { test as base, expect, type Locator, type Page } from "@playwright/test";

/** 매 테스트 전에 MiniCloud 상태를 시드 데이터로 되돌린다. */
export const test = base.extend<{ resetCloud: void }>({
  resetCloud: [
    async ({ request }, use) => {
      const res = await request.post("/api/_reset", { headers: { "x-actor": "human" } });
      expect(res.ok()).toBe(true);
      await use();
    },
    { auto: true },
  ],
});

export { expect };

export const row = (page: Page, name: string): Locator =>
  page.locator("tbody tr").filter({ has: page.getByText(name, { exact: true }) });

/**
 * v1 콘솔의 아이콘 버튼에는 접근성 이름이 없어서 role 기반 locator를 쓸 수 없다.
 * 테스트도 CSS 클래스와 위치에 의존해야 한다 — 이것 자체가 v1의 문제를 보여준다.
 */
export const refreshButton = (page: Page) => page.locator(".page-header .icon-btn").first();
export const rowMenuButton = (rowLocator: Locator) => rowLocator.locator(".row-menu > button");
