import type { AppRun } from "../../src/app/audits";
import { screenUrl } from "./api";
import { modelName, OUTCOME, runLabel, SAID } from "./text";

function Steps({ steps }: { steps: AppRun["steps"] }) {
  return (
    <ol className="app-steps">
      {steps.map((step, index) => (
        <li key={index}>
          <code>{step.tool}</code> {step.detail}
          {step.failed && <strong data-tone="bad"> 실패</strong>}
        </li>
      ))}
    </ol>
  );
}

export function RunDetail({ auditId, index, run }: { auditId: string; index: number; run: AppRun }) {
  const { result } = run;
  const name = modelName(run.model);

  if (!result) {
    return (
      <section className="app-result" aria-label={`${name} 진행`}>
        <p className="app-eyebrow">{name}</p>
        <h2 className="app-verdict" data-tone="none" aria-live="polite">{runLabel(run)}</h2>
        {run.message && <p className="app-meaning">{run.message}</p>}
        <Steps steps={run.steps} />
      </section>
    );
  }

  const { title, tone, meaning } = OUTCOME[result.outcome];
  const invalid = result.outcome === "invalid";

  return (
    <section className="app-result" aria-label={`${name} 결과`}>
      <p className="app-eyebrow">{name} · {result.seconds}초</p>
      <h2 className="app-verdict" data-tone={tone}>{title}</h2>
      <p className="app-meaning">{meaning}</p>
      {result.error && <p className="app-meaning"><code>{result.error}</code></p>}
      {result.cautions.map((caution) => (
        <p className="app-notice" key={caution}>{caution}</p>
      ))}

      {!invalid && (
        <dl className="app-versus">
          <div>
            <dt>에이전트의 보고</dt>
            <dd>{SAID[result.said]}</dd>
          </div>
          <div>
            <dt>검사기의 채점</dt>
            <dd data-tone={result.success ? "good" : "bad"}>{result.success ? "기준 충족" : "기준 못 채움"}</dd>
          </div>
        </dl>
      )}

      <div className="app-evidence">
        {result.screenshot && (
          <figure>
            <a href={screenUrl(auditId, index)} target="_blank" rel="noreferrer">
              <img src={screenUrl(auditId, index)} width={1280} height={800} alt={`${name}이 끝낸 순간의 화면`} />
            </a>
            <figcaption>에이전트가 끝낸 순간의 실제 화면</figcaption>
          </figure>
        )}

        <div className="app-findings">
          {!invalid && (
            <>
              <h3>채점 근거</h3>
              <ul className="app-checks">
                {result.checks.map((check) => (
                  <li key={check.label}>
                    <strong data-tone={check.met ? "good" : "bad"}>{check.met ? "충족" : "미충족"}</strong>
                    <span>{check.label}{check.reason && <small>{check.reason}</small>}</span>
                  </li>
                ))}
              </ul>
              {(result.success || result.notes.some((note) => note.includes("새로고침"))) && <p className="app-hint">{result.notes.join(" / ")}</p>}

              <h3>고치기 전에 볼 곳</h3>
              {result.advice.length === 0 ? (
                <p className="app-hint">규칙으로 찾은 막힌 곳이 없습니다.</p>
              ) : (
                <ul className="app-advice">
                  {result.advice.map((item) => (
                    <li key={item.title}>
                      <strong>{item.title}</strong>
                      <p>{item.action}</p>
                      {item.evidence && <code>{item.evidence}</code>}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          <h3>에이전트가 남긴 말</h3>
          <p className="app-answer">{result.answer.replaceAll("**", "") || "보고 없이 끝남"}</p>

          <details>
            <summary>조작 기록 {run.steps.length}번 보기</summary>
            <Steps steps={run.steps} />
          </details>
        </div>
      </div>
    </section>
  );
}
