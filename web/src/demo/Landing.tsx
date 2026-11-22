import { useState } from "react";
import summary from "virtual:bench-summary";
import type { PathKey, PathSummary } from "../../../src/bench/summary";
import { AuditBuilder } from "./AuditBuilder";
import { FoundProblem } from "./FoundProblem";
import { LiveEvidence } from "./LiveEvidence";
import liveTasks from "./live-evidence.json";
import { StopCompare } from "./StopCompare";
import "./landing.css";

const REPO = "https://github.com/leeeeeseojin/intentguard";
const doc = (path: string) => `${REPO}/blob/main/${path}`;

const PATHS: { key: PathKey; label: string }[] = [
  { key: "v1", label: "Web v1 (기존)" },
  { key: "v2", label: "Web v2 (개선)" },
  { key: "mcp", label: "MCP" },
];

const LIVE_RUNS = liveTasks.reduce((sum, task) => sum + task.runs.length, 0);
const LIVE_SITES = new Set(liveTasks.map((task) => new URL(task.url).hostname)).size;

const pct = (k: number, n: number) => `${Math.round((k / n) * 100)}%`;

const METRICS: { label: string; value: (p: PathSummary) => string; note?: (p: PathSummary) => string }[] = [
  { label: "성공률", value: (p) => pct(p.success, p.runs), note: (p) => `${p.success}/${p.runs}` },
  { label: "확인된 성공률", value: (p) => pct(p.verified, p.runs), note: (p) => `${p.verified}/${p.runs}` },
  { label: "평균 턴", value: (p) => p.turns.toFixed(1) },
  { label: "평균 시간", value: (p) => `${p.seconds.toFixed(0)}초` },
  { label: "평균 컨텍스트 토큰", value: (p) => `${(p.tokens / 10_000).toFixed(1)}만` },
];

const FINDINGS = [
  {
    title: "됐는데, 안 됐다고 보고한다",
    cause: "v1은 작업 뒤에도 목록이 그대로다. 에이전트는 실제로 성공하고도 실패로 보고하거나 같은 작업을 다시 시도했다.",
    change: "자동 갱신, 전이 상태 표시, 사라지지 않는 결과 메시지",
  },
  {
    title: "상태를 읽을 수 없어 추측한다",
    cause: "색 점과 div 토글은 접근성 트리에 상태가 남지 않는다. 에이전트는 CSS 클래스와 서버 이름으로 추측했다.",
    change: "환경·상태를 텍스트로 표시, role=switch와 aria-checked",
  },
  {
    title: "막힌 이유를 몰라 포기한다",
    cause: "실행 중인 서버의 삭제가 거부되자 에이전트는 다른 방법이 없다고 판단하고 멈췄다.",
    change: "비활성 동작 옆에 이유와 먼저 할 일을 표시",
  },
  {
    title: "성공률 100%가 버그를 숨긴다",
    cause: "v2의 감독 패널이 제출 버튼을 가렸지만 3번 모두 성공으로 채점됐다. 에이전트가 Enter 키와 창 크기 변경으로 우회했기 때문이다.",
    change: "측정 후 레이아웃 수정, 화면 폭 5종 회귀 E2E",
  },
];

function AgentTrial() {
  const [id, setId] = useState(summary.scenarios[0]!.id);
  const [ui, setUi] = useState("v2");
  const [copied, setCopied] = useState("");
  const task = summary.scenarios.find((s) => s.id === id)!;
  const prompt = `브라우저로 ${location.origin}/?ui=${ui}&actor=agent 를 열고, 화면만 조작해서 다음 요청을 처리해줘.\n\n요청: ${task.prompt}\n\n끝나면 무엇을 했고 화면에서 결과를 확인했는지 보고해줘.`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied("복사했습니다.");
    } catch {
      setCopied("복사하지 못했습니다. 문장을 직접 선택해 복사하세요.");
    }
  }

  return (
    <div className="trial">
      <label>
        과제
        <select value={id} onChange={(e) => { setId(e.target.value); setCopied(""); }}>
          {summary.scenarios.map((s) => (
            <option key={s.id} value={s.id}>{s.title}</option>
          ))}
        </select>
      </label>
      <label>
        화면
        <select value={ui} onChange={(e) => { setUi(e.target.value); setCopied(""); }}>
          <option value="v1">v1 (기존)</option>
          <option value="v2">v2 (개선)</option>
        </select>
      </label>
      <label className="trial-prompt">
        에이전트에게 보낼 문장
        <textarea readOnly rows={7} value={prompt} />
      </label>
      <button type="button" className="cta" onClick={() => void copy()}>문장 복사</button>
      <p role="status">{copied}</p>
    </div>
  );
}

export function Landing() {
  return (
    <div className="landing">
      <div className="landing-top">
        <p className="product">IntentGuard</p>
        <nav className="site-nav" aria-label="이 페이지">
          <a href="#how">방법</a>
          <a href="#live">실제 기록</a>
          <a href="#case">사례</a>
        </nav>
        <a className="cta compact" href="#audit">검사하기</a>
      </div>

      <header>
        <div className="hero">
          <div>
            <h1>
              AI 에이전트가
              <em>내 사이트를 쓸 수 있을까요?</em>
            </h1>
            <p className="lead">
              주소와 시킬 일을 넣으면 AI 에이전트가 실제로 해봅니다. <strong>AI의 말이 아니라 실제 상태로</strong> 성공을 판정하고, 막힌 곳을 알려줍니다.
            </p>
            <nav className="actions" aria-label="시작">
              <a className="cta" href="#audit">내 사이트 검사하기</a>
              <a className="cta secondary" href="#live">실제 기록 보기</a>
            </nav>
          </div>
          <FoundProblem />
        </div>
      </header>

      <main>
        <section className="chapter wide" aria-labelledby="how">
          <div className="chapter-head">
            <h2 id="how">이렇게 검사합니다</h2>
          </div>
          <ol className="how">
            <li>
              <h3>주소와 시킬 일을 넣는다</h3>
              <p>끝났을 때 화면에 보여야 할 글자가 성공 조건이 됩니다.</p>
            </li>
            <li>
              <h3>AI 에이전트가 직접 조작한다</h3>
              <p>사람처럼 화면을 읽고 누르고 입력합니다. 여러 모델을 같은 조건으로 돌릴 수 있습니다.</p>
            </li>
            <li>
              <h3>실제 상태로 채점한다</h3>
              <p>판정, 마지막 화면, 누른 순서, 막힌 곳을 돌려줍니다.</p>
            </li>
          </ol>
        </section>

        <section className="chapter wide" aria-labelledby="live">
          <div className="chapter-head">
            <h2 id="live">실제 사이트에서 테스트한 기록</h2>
            <p>배포된 사이트 {LIVE_SITES}곳에서 {LIVE_RUNS}번 검사했습니다. 이 본 실행에서 나온 실패도 빼지 않았습니다.</p>
            <p className="fine">모델마다 과제당 1회라서 모델의 순위가 아니라 동작 기록으로 봐 주세요. 확인했다는 보고도 확인의 증거는 아닙니다.</p>
          </div>
          <LiveEvidence />
        </section>

        <section className="chapter" aria-labelledby="audit">
          <div className="chapter-head">
            <h2 id="audit">내 사이트 검사하기</h2>
            <p>Vercel, AWS, localhost 어디든 브라우저로 열리는 주소면 됩니다. 세 칸을 채우면 내 PC에서 돌릴 명령이 만들어집니다.</p>
          </div>
          <AuditBuilder />
        </section>

        <section className="chapter" aria-labelledby="case">
          <div className="chapter-head">
            <h2 id="case">사례: 고치면 정말 좋아질까?</h2>
            <p>
              문제를 일부러 넣은 모의 클라우드 콘솔(v1)과 고친 콘솔(v2)로 실험했습니다. 결과까지 확인한 성공이{" "}
              <strong>
                {pct(summary.paths.v1.verified, summary.paths.v1.runs)}에서 {pct(summary.paths.v2.verified, summary.paths.v2.runs)}로
              </strong>{" "}
              늘었습니다.
            </p>
            <nav className="actions" aria-label="사례 체험">
              <a className="cta secondary" href="/?ui=v1">기존 v1 체험</a>
              <a className="cta secondary" href="/?ui=v2">개선된 v2 체험</a>
            </nav>
            <p className="fine">MiniCloud는 실험용 모의 콘솔입니다. 실제 서버는 만들어지거나 바뀌지 않으며, 바꾼 내용은 이 탭에만 저장됩니다.</p>
          </div>
          <StopCompare />
        </section>

        <section className="chapter wide case-part" aria-labelledby="result">
          <div className="chapter-head">
            <h3 id="result">실험 결과</h3>
            <p>{summary.model}에게 과제 {summary.scenarios.length}개를 경로별로 3번씩 시켰습니다.</p>
            <p className="fine">
              성공은 서버 상태와 감사 로그로 채점했습니다. 확인된 성공은 그중 에이전트가 최종 상태까지 확인했다고 보고한 실행입니다.
            </p>
          </div>
          <div>
            <div className="scroll" role="region" aria-label="경로별 결과 표" tabIndex={0}>
              <table>
                <thead>
                  <tr>
                    <th scope="col">지표</th>
                    {PATHS.map((p) => <th scope="col" key={p.key}>{p.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {METRICS.map((m) => (
                    <tr key={m.label}>
                      <th scope="row">{m.label}</th>
                      {PATHS.map((p) => (
                        <td key={p.key}>
                          {m.value(summary.paths[p.key])}
                          {m.note && <small> ({m.note(summary.paths[p.key])})</small>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <details>
              <summary>과제별 결과 보기</summary>
              <div className="scroll" role="region" aria-label="과제별 결과 표" tabIndex={0}>
                <table>
                  <caption>확인된 성공 / 실행 수 · 평균 턴</caption>
                  <thead>
                    <tr>
                      <th scope="col">과제</th>
                      {PATHS.map((p) => <th scope="col" key={p.key}>{p.label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {summary.scenarios.map((s) => (
                      <tr key={s.id}>
                        <th scope="row">{s.title}</th>
                        {PATHS.map((p) => (
                          <td key={p.key}>{s.paths[p.key].verified}/{s.paths[p.key].runs} · {s.paths[p.key].turns.toFixed(0)}턴</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </div>
        </section>

        <section className="chapter wide case-part" aria-labelledby="findings">
          <div className="chapter-head">
            <h3 id="findings">무엇을 고쳤나</h3>
          </div>
          <ul className="findings">
            {FINDINGS.map((f) => (
              <li key={f.title}>
                <h3>{f.title}</h3>
                <p>{f.cause}</p>
                <p className="change">고친 것: {f.change}</p>
              </li>
            ))}
          </ul>

          <details className="case-try">
            <summary>이 사례를 직접 따라 해보기</summary>
            <div className="case-try-body">
              <div>
                <h3>사람으로</h3>
                <ol className="guide">
                  <li><a href="/?ui=v1">v1</a>에서 서버를 정지해 보세요. 목록은 새로고침 버튼을 누르기 전까지 그대로입니다.</li>
                  <li><a href="/?ui=v2">v2</a>에서 같은 작업을 해 보세요. 상태가 스스로 바뀝니다.</li>
                  <li>v2 위쪽의 "에이전트 요청 보내기"로 위험한 요청을 만들고, 감독 패널에서 승인하거나 거절해 보세요.</li>
                </ol>
              </div>
              <div>
                <h3>내 에이전트로</h3>
                <p>브라우저를 조작할 수 있는 에이전트에게 이 문장을 보내세요.</p>
                <AgentTrial />
              </div>
            </div>
          </details>
        </section>

        <section className="chapter" aria-labelledby="limits">
          <div className="chapter-head">
            <h2 id="limits">한계</h2>
            <p className="more">
              <a href={doc("docs/analysis-v1.md")}>실패 분석</a>
              <a href={doc("docs/analysis-v2.md")}>개선 검증</a>
              <a href={doc("docs/results/final-comparison.md")}>전체 리포트</a>
            </p>
          </div>
          <div className="limits">
            <div>
              <h3>검사기</h3>
              <ul className="guide">
                <li>로그인이 필요한 화면, CAPTCHA, 자동 브라우저를 막는 사이트는 검사할 수 없습니다.</li>
                <li>막힌 곳은 확인할 지점이지 실패 원인의 확정이 아닙니다.</li>
                <li>공개 기록은 과제당 1회이며, 검사기를 만들며 돌린 시험 실행은 포함하지 않았습니다.</li>
              </ul>
            </div>
            <div>
              <h3>v1·v2 사례</h3>
              <ul className="guide">
                <li>표는 측정 당시 화면의 결과입니다. 이후 고친 화면으로는 같은 조건의 재측정을 하지 않았습니다.</li>
                <li>확인 여부는 AI가 단독으로 검수했습니다. <a href={doc("docs/results/verification-labels.json")}>실행별 근거</a>를 공개합니다.</li>
                <li>모델 1종, 과제당 3회입니다. 시나리오와 채점기를 같은 사람이 만들었고 블라인드 검증이 아닙니다.</li>
                <li>v1은 문제 패턴을 일부러 넣은 기준선이고 그중 일부는 실제 콘솔보다 불리해, 개선 폭이 과대평가됐을 수 있습니다.</li>
                <li>승인 패널은 협업 UX 프로토타입입니다. 인증이 없으므로 실제 권한 경계가 아닙니다.</li>
              </ul>
            </div>
          </div>
        </section>
      </main>

      <section className="closing" aria-labelledby="closing">
        <h2 id="closing">AI 에이전트도 쓸 수 있는 사이트로</h2>
        <div className="actions">
          <a className="cta" href="#audit">검사 시작하기</a>
          <a className="cta secondary" href={REPO}>GitHub에서 보기</a>
        </div>
      </section>

      <footer className="site-foot">
        <p>IntentGuard · Agent UX 검사기</p>
        <p>실험용 개인 프로젝트</p>
      </footer>
    </div>
  );
}
