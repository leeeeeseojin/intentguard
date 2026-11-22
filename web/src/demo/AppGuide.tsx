import { useState } from "react";

const SETUP = [
  "git clone https://github.com/leeeeeseojin/intentguard.git",
  "cd intentguard",
  "pnpm install",
  "pnpm exec playwright install chromium",
];
const START = "pnpm exec tsx src/app/main.ts";

/** 검사는 각자 PC의 앱에서 돈다. 이 사이트에서는 에이전트를 실행하지 않는다. */
export function AppGuide() {
  const [copied, setCopied] = useState("");

  async function copy() {
    try {
      await navigator.clipboard.writeText(START);
      setCopied("복사했습니다.");
    } catch {
      setCopied("복사하지 못했습니다. 명령을 직접 선택해 복사하세요.");
    }
  }

  return (
    <div className="trial">
      <div className="trial-prompt">
        <p>처음 한 번 준비</p>
        <pre className="setup"><code>{SETUP.join("\n")}</code></pre>
      </div>
      <label className="trial-prompt">
        검사 앱 켜기
        <textarea readOnly rows={1} value={START} />
      </label>
      <button type="button" className="cta" onClick={() => void copy()}>실행 명령 복사</button>
      <p role="status">{copied}</p>
      <p className="fine trial-prompt">
        켠 뒤 <code>http://127.0.0.1:4717</code>을 열면 주소 입력부터 판정, 증거, 재검사까지 한 화면에서 합니다. Node.js 22, pnpm, 로그인된 Antigravity CLI(agy)가 필요합니다. 로그인이 필요한 사이트는 아직 검사할 수 없습니다.
      </p>
    </div>
  );
}
