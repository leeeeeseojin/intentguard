import { describe, expect, it } from "vitest";
import { describeInput, redact } from "../src/audit/publish.js";

describe("공개용 기록", () => {
  it("사용자 이름이 든 로컬 경로를 지운다", () => {
    const home = "C:\\Users\\someone";
    expect(redact("C:\\Users\\someone\\secret.txt", home)).not.toContain("someone");
    expect(redact("C:/Users/someone/a.json", home)).not.toContain("someone");
    expect(redact("C:/Users/other/a.json", home)).not.toContain("other");
  });

  it("조작은 대상과 입력값만 남긴다", () => {
    expect(describeInput({ element: "저장 버튼", target: "e3", extra: "숨김" })).toBe("저장 버튼");
  });
});
