import { useState } from "react";

const SETUP = [
  "git clone https://github.com/leeeeeseojin/intentguard.git",
  "cd intentguard",
  "pnpm install",
  "pnpm exec playwright install chromium",
];
const START = "pnpm exec tsx src/app/main.ts";
const SKILL = "claude --plugin-dir ./plugin";
const MCP_ARGS = 'node "$PWD/node_modules/tsx/dist/cli.mjs" "$PWD/src/audit/mcp-main.ts"';
const MCP_CLAUDE = `claude mcp add intentguard -- ${MCP_ARGS}`;

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
        켠 뒤 <code>http://127.0.0.1:4717</code>에서 검사합니다.
      </p>

      <label className="trial-prompt">
        AI 에이전트에게 맡기기 (스킬·MCP)
        <textarea readOnly rows={1} value={SKILL} />
      </label>
      <button type="button" className="cta secondary" onClick={() => void copy(SKILL)}>스킬 명령 복사</button>
      <p className="fine trial-prompt">
        붙인 뒤 "이 사이트 검사해 줘"라고 말하면 됩니다. 채점은 에이전트가 아니라 검사기가 합니다.
      </p>

      <label className="trial-prompt">
        MCP 서버 연결 (Claude Code)
        <textarea readOnly rows={3} value={MCP_CLAUDE} />
      </label>
      <button type="button" className="cta secondary" onClick={() => void copy(MCP_CLAUDE)}>MCP 연결 명령 복사</button>
      <p className="fine trial-prompt">
        저장소 폴더에서 한 번 실행합니다. 다른 에이전트는 <a href="https://github.com/leeeeeseojin/intentguard#mcp로-연결하기">설정 예시</a>를 보세요.
      </p>

      <p className="fine trial-prompt">
        Node.js 22, pnpm, 그리고 Antigravity CLI나 Claude Code 로그인이 필요합니다. 사용량은 내 계정에서 듭니다.
      </p>
      <p role="status" className="trial-prompt">{copied}</p>
    </div>
  );
}
