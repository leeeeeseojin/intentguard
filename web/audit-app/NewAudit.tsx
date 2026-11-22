import { useState, type FormEvent } from "react";
import type { Audit, AuditInput } from "../../src/app/audits";
import { MODELS, MODEL_NAMES } from "../../src/app/models";
import { api, messageOf } from "./api";

interface Props {
  initial?: AuditInput;
  ready: boolean;
  onStarted: (audit: Audit) => void;
}

export function NewAudit({ initial, ready, onStarted }: Props) {
  const [url, setUrl] = useState(initial?.url ?? "");
  const [task, setTask] = useState(initial?.task ?? "");
  const [expect, setExpect] = useState(initial?.expect.join("\n") ?? "");
  const [persist, setPersist] = useState<boolean | undefined>(initial?.persist);
  const [allowWrites, setAllowWrites] = useState(initial?.allowWrites ?? false);
  const [models, setModels] = useState<AuditInput["models"]>(initial?.models ?? [MODELS[0]]);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (persist === undefined) return;
    if (!models.length) return setError("모델을 하나 이상 골라 주세요.");
    setStarting(true);
    setError("");
    try {
      const lines = expect.split("\n").map((line) => line.trim()).filter(Boolean);
      onStarted(await api.start({ url, task, expect: lines, persist, allowWrites, models }));
    } catch (err) {
      setError(messageOf(err));
      setStarting(false);
    }
  }

  return (
    <section className="new" aria-labelledby="new">
      <div className="new-head">
        <h1 id="new">
          AI 에이전트가
          <em>이 일을 해낼까요?</em>
        </h1>
        <p>에이전트가 화면을 직접 조작하고, 채점은 검사기 코드가 합니다. 에이전트가 “됐다”고 해도 기준을 못 채우면 실패입니다.</p>
      </div>

      <form className="form" onSubmit={(event) => void submit(event)}>
        <label className="field">
          <span>검사할 주소</span>
          <input type="url" required placeholder="https://my-site.vercel.app" value={url} onChange={(e) => setUrl(e.target.value)} />
        </label>

        <label className="field">
          <span>시킬 일</span>
          <textarea required rows={2} maxLength={1000} placeholder="예: 요금 안내를 열어줘" value={task} onChange={(e) => setTask(e.target.value)} />
        </label>

        <label className="field">
          <span>끝났을 때 보여야 할 문구</span>
          <textarea required rows={2} aria-describedby="expect-hint" placeholder="예: 월 9,900원" value={expect} onChange={(e) => setExpect(e.target.value)} />
          <small id="expect-hint">
            한 줄에 하나씩, 문구 전체를 그대로 적으세요. 버튼·링크·메뉴·입력칸의 글자와 다른 문장에 섞인 글자는 인정하지 않습니다.
          </small>
        </label>

        <fieldset>
          <legend>언제까지 남아 있어야 성공인가요?</legend>
          <label className="choice">
            <input type="radio" name="persist" required checked={persist === false} onChange={() => setPersist(false)} />
            <span>끝난 화면에 보이면 됨<small>열기, 찾기, 필터처럼 저장이 없는 일</small></span>
          </label>
          <label className="choice">
            <input type="radio" name="persist" checked={persist === true} onChange={() => setPersist(true)} />
            <span>새로고침 뒤에도 남아야 함<small>추가, 수정, 설정처럼 저장되는 일</small></span>
          </label>
        </fieldset>

        <fieldset>
          <legend>시킬 모델</legend>
          <div className="models">
            {MODELS.map((model) => (
              <label className="choice" key={model}>
                <input
                  type="checkbox"
                  checked={models.includes(model)}
                  onChange={(e) => setModels((prev) => (e.target.checked ? [...prev, model] : prev.filter((m) => m !== model)))}
                />
                <span>{MODEL_NAMES[model]}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="choice">
          <input type="checkbox" checked={allowWrites} onChange={(e) => setAllowWrites(e.target.checked)} />
          <span>
            서버 데이터 변경 허용
            <small>본인의 테스트 환경에서만 켜세요. 끄면 POST 같은 쓰기 요청을 막습니다.</small>
          </span>
        </label>

        {error && <p className="notice" role="alert">{error}</p>}
        <button className="primary" type="submit" disabled={!ready || starting}>{starting ? "시작하는 중…" : "검사 시작"}</button>
        <p className="hint">모델마다 보통 1~4분 걸리고 내 Antigravity 사용량을 씁니다. 로그인이 필요한 화면은 검사할 수 없습니다.</p>
      </form>
    </section>
  );
}
