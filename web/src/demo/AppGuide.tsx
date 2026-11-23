import { useState } from "react";

const SETUP = [
  "git clone https://github.com/leeeeeseojin/intentguard.git",
  "cd intentguard",
  "pnpm install",
  "pnpm exec playwright install chromium",
];
const START = "pnpm exec tsx src/app/main.ts";
const SKILL = "claude --plugin-dir ./plugin";

/** 검사는 각자 PC에서 돈다. 이 사이트(정적 배포)에서는 브라우저도 에이전트도 실행할 수 없다. */
export function AppGuide() {
  const [copied, setCopied] = useState("");

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
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
      <button type="button" className="cta" onClick={() => void copy(START)}>실행 명령 복사</button>
      <p className="fine trial-prompt">
        켠 뒤 <code>http://127.0.0.1:4717</code>을 열면 이 페이지와 같은 화면에서 주소를 넣고 바로 검사합니다. 판정, 마지막 화면, 재검사 전후 비교까지 나옵니다.
      </p>

      <label className="trial-prompt">
        AI 에이전트에게 맡기기 (스킬·MCP)
        <textarea readOnly rows={1} value={SKILL} />
      </label>
      <button type="button" className="cta secondary" onClick={() => void copy(SKILL)}>스킬 명령 복사</button>
      <p className="fine trial-prompt">
        이 명령은 스킬과 MCP 도구를 함께 붙입니다. Claude Desktop, Cursor, Antigravity 같은 다른 에이전트에는 MCP 서버(<code>audit_site</code>)만 연결하면 됩니다. 그 뒤 "이 사이트에서 AI가 회원가입을 할 수 있는지 검사해 줘"라고 말하면 에이전트가 검사기를 돌리고 결과를 전합니다. 채점은 그 에이전트가 아니라 검사기가 하고, 검사는 연결한 사람의 PC와 로그인으로 돕니다.
      </p>

      <p role="status" className="trial-prompt">{copied}</p>
      <p className="fine trial-prompt">
        Node.js 22, pnpm, 그리고 로그인된 Antigravity CLI(agy)나 Claude Code 중 하나가 필요합니다. 사이트를 조작하는 에이전트로 둘 중 하나를 고를 수 있고, 검사할 때마다 그 계정의 사용량이 듭니다. 로그인이 필요한 사이트는 아직 검사할 수 없습니다.
      </p>
    </div>
  );
}
