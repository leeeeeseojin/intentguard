import { useEffect, useId, useState } from "react";
import { api, type SecurityGroup } from "../api";
import { Dialog } from "./Dialog";
import { NAME_PATTERN, NAME_RULE } from "./labels";
import { useStatus } from "./StatusRegion";

const SPECS = [
  { value: "micro", detail: "1 vCPU / 1GB", cost: 9_000 },
  { value: "small", detail: "2 vCPU / 4GB", cost: 24_000 },
  { value: "medium", detail: "4 vCPU / 8GB", cost: 52_000 },
  { value: "large", detail: "8 vCPU / 16GB", cost: 110_000 },
] as const;

/**
 * v1의 3단계 마법사를 한 화면의 폼으로 바꿨다.
 * P6: 라벨과 이름 규칙을 처음부터 보여주고 입력하는 즉시 검증한다.
 * 생성 버튼이 비활성일 때는 무엇이 빠졌는지 텍스트로 알려준다.
 */
export function CreateServerDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { run, status, set: setStatus } = useStatus();
  const [name, setName] = useState("");
  const [env, setEnv] = useState("");
  const [spec, setSpec] = useState("");
  const [zone, setZone] = useState("KR-1");
  const [sgId, setSgId] = useState("sg-default");
  const [publicIp, setPublicIp] = useState(false);
  const [groups, setGroups] = useState<SecurityGroup[]>([]);
  const [busy, setBusy] = useState(false);
  const ids = { name: useId(), rule: useId(), zone: useId(), sg: useId() };

  useEffect(() => {
    void api.listSecurityGroups().then(setGroups);
    setStatus(null);
  }, [setStatus]);

  const nameError = name && !NAME_PATTERN.test(name) ? `이름 규칙에 맞지 않습니다: ${NAME_RULE}` : "";
  const missing = [!name && "서버 이름", nameError && "올바른 서버 이름", !env && "환경", !spec && "사양"].filter(Boolean) as string[];

  async function submit() {
    setBusy(true);
    const ok = await run(
      () => api.createInstance({ name, env, spec, zone, securityGroupId: sgId, assignPublicIp: publicIp }),
      `서버 ${name} 생성을 시작했습니다. 상태가 '실행 중'이 될 때까지 목록이 자동으로 갱신됩니다.`,
    );
    setBusy(false);
    onCreated();
    if (ok) onClose();
  }

  return (
    <Dialog
      title="서버 생성"
      onClose={onClose}
      width={620}
      footer={
        <>
          {missing.length > 0 && <span className="footer-note">입력 필요: {missing.join(", ")}</span>}
          <button className="btn" onClick={onClose}>
            취소
          </button>
          <button className="btn btn-primary" disabled={missing.length > 0 || busy} onClick={() => void submit()}>
            서버 생성
          </button>
        </>
      }
    >
      {/* 대화상자가 열려 있는 동안 배경의 결과 영역은 가려지므로, 실패 이유는 여기서 보여준다. */}
      {status && status.kind !== "success" && (
        <div className={`status-msg status-msg-${status.kind}`} role="alert">
          <div className="status-msg-body">
            <strong>{status.title}</strong>
            {status.hint && <div className="status-hint">다음 행동: {status.hint}</div>}
          </div>
        </div>
      )}
      <div className="form">
        <label className="field" htmlFor={ids.name}>
          <span className="field-label">서버 이름</span>
          <input
            id={ids.name}
            className="input"
            value={name}
            aria-describedby={ids.rule}
            aria-invalid={!!nameError}
            onChange={(e) => setName(e.target.value)}
          />
          <span className="field-help" id={ids.rule}>
            규칙: {NAME_RULE} (예: report-api-dev)
          </span>
          {nameError && <span className="field-error">{nameError}</span>}
        </label>

        <fieldset className="field">
          <legend className="field-label">환경</legend>
          <div className="radio-row">
            {(["dev", "staging", "prod"] as const).map((v) => (
              <label key={v} className="radio">
                <input type="radio" name="env" value={v} checked={env === v} onChange={() => setEnv(v)} />
                {v} ({v === "dev" ? "개발" : v === "staging" ? "스테이징" : "운영"})
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="field">
          <legend className="field-label">사양</legend>
          <div className="radio-grid">
            {SPECS.map((s) => (
              <label key={s.value} className="radio radio-card">
                <input type="radio" name="spec" value={s.value} checked={spec === s.value} onChange={() => setSpec(s.value)} />
                <span>
                  <strong>{s.value}</strong> · {s.detail} · 월 {s.cost.toLocaleString()}원
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="field-row">
          <label className="field" htmlFor={ids.zone}>
            <span className="field-label">존(Zone)</span>
            <select id={ids.zone} className="input" value={zone} onChange={(e) => setZone(e.target.value)}>
              <option value="KR-1">KR-1</option>
              <option value="KR-2">KR-2</option>
            </select>
          </label>
          <label className="field" htmlFor={ids.sg}>
            <span className="field-label">보안 그룹</span>
            <select id={ids.sg} className="input" value={sgId} onChange={(e) => setSgId(e.target.value)}>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="check">
          <input type="checkbox" checked={publicIp} onChange={(e) => setPublicIp(e.target.checked)} />
          공인 IP 할당
        </label>
      </div>
    </Dialog>
  );
}
