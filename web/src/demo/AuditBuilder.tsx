import { useState } from "react";
import { auditCommand, SETUP_COMMANDS, validTarget } from "./auditCommand";

/** 내 URL 검사: 에이전트는 각자 PC에서 돈다. 이 사이트는 API 키도 주소도 받지 않는다. */
export function AuditBuilder() {
  const [url, setUrl] = useState("");
  const [task, setTask] = useState("");
  const [expected, setExpected] = useState("");
  const [copied, setCopied] = useState("");

  const ready = validTarget(url) && task.trim() !== "" && expected.trim() !== "";
  const command = ready ? auditCommand(url, task, expected) : "";

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied("복사했습니다.");
    } catch {
      setCopied("복사하지 못했습니다. 명령을 직접 선택해 복사하세요.");
    }
  }

  return (
    <div className="trial" onChange={() => setCopied("")}>
      <label className="trial-prompt">
        검사할 주소
        <input className="input" type="url" placeholder="예: https://my-site.vercel.app" value={url} onChange={(e) => setUrl(e.target.value)} />
      </label>
      <label>
        시킬 일
        <input className="input" placeholder="예: 요금 안내를 열어줘" value={task} onChange={(e) => setTask(e.target.value)} />
      </label>
      <label>
        끝났을 때 보여야 할 글자
        <input className="input" placeholder="예: 월 9,900원" value={expected} onChange={(e) => setExpected(e.target.value)} />
      </label>
      <label className="trial-prompt">
        실행 명령
        <textarea readOnly rows={3} value={command} placeholder="세 칸을 채우면 명령이 만들어집니다." />
      </label>
      <button type="button" className="cta" disabled={!ready} onClick={() => void copy()}>명령 복사</button>
      <p role="status">{copied}</p>
      <details className="trial-prompt">
        <summary>처음 한 번 준비하기</summary>
        <p className="fine">Node.js 22, pnpm, 로그인된 Antigravity CLI(agy)가 필요합니다.</p>
        <pre className="setup"><code>{SETUP_COMMANDS.join("\n")}</code></pre>
      </details>
      <p className="fine trial-prompt">
        주소는 이 사이트로 전송되지 않고, 에이전트는 내 PC에서 실행됩니다. 서버 데이터를 바꾸는 과제는 본인 테스트 환경에서만 <code>--allow-writes</code>를 붙이세요. 로그인이 필요한 화면은 아직 검사할 수 없습니다.
      </p>
    </div>
  );
}
