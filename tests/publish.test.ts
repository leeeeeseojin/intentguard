import { describe, expect, it } from "vitest";
import { describeInput, redact } from "../src/audit/publish.js";
import { auditCommand, validTarget } from "../web/src/demo/auditCommand.js";

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

describe("내 URL 검사 명령", () => {
  it.each(["https://a.example", "http://localhost:3000/x"])("%s는 검사할 수 있다", (url) => {
    expect(validTarget(url)).toBe(true);
  });

  it.each(["file:///etc/passwd", "javascript:alert(1)", "그냥 글자"])("%s는 거부한다", (url) => {
    expect(validTarget(url)).toBe(false);
  });

  it("입력값이 따옴표를 빠져나와 다른 명령이 되지 않는다", () => {
    const command = auditCommand("https://a.example/", "x'; rm -rf ~; '", "y\u2019; calc\nz");
    expect(command.match(/'/g)).toHaveLength(6);
    expect(command).not.toMatch(/[\u2018\u2019\n]/);
  });
});
