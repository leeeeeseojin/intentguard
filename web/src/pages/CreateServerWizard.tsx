import { useEffect, useState } from "react";
import { api, ApiError, type SecurityGroup } from "../api";
import { Modal } from "../components/Modal";
import { useToast } from "../components/Toast";

const STEPS = ["기본 정보", "서버 타입", "네트워크 설정"] as const;

const ENV_OPTIONS = [
  { value: "dev", label: "개발" },
  { value: "staging", label: "스테이징" },
  { value: "prod", label: "운영" },
] as const;

const SPECS = [
  { value: "micro", cpu: "1 vCPU", mem: "1GB", cost: 9_000 },
  { value: "small", cpu: "2 vCPU", mem: "4GB", cost: 24_000 },
  { value: "medium", cpu: "4 vCPU", mem: "8GB", cost: 52_000 },
  { value: "large", cpu: "8 vCPU", mem: "16GB", cost: 110_000 },
] as const;

export function CreateServerWizard({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [env, setEnv] = useState("");
  const [zone, setZone] = useState("KR-1");
  const [spec, setSpec] = useState("");
  const [sgId, setSgId] = useState("sg-default");
  const [publicIp, setPublicIp] = useState(false);
  const [groups, setGroups] = useState<SecurityGroup[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void api.listSecurityGroups().then(setGroups);
  }, []);

  // v1-pattern: silent-disabled — 무엇이 빠졌는지 알려주지 않고 버튼만 비활성화한다.
  const canNext = step === 0 ? name.length > 0 && env !== "" : step === 1 ? spec !== "" : true;

  async function submit() {
    setSubmitting(true);
    try {
      await api.createInstance({ name, env, spec, zone, securityGroupId: sgId, assignPublicIp: publicIp });
      toast("success", "서버 생성 요청이 완료되었습니다.");
      onClose();
    } catch (e) {
      // v1-pattern: late-validation — 이름 형식 오류를 마지막 단계에서야 서버 응답으로 알게 된다.
      toast("error", e instanceof ApiError ? e.body.message : "요청에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      title="서버 생성"
      onClose={onClose}
      width={640}
      footer={
        <>
          {step > 0 && (
            <button className="btn" onClick={() => setStep(step - 1)}>
              이전
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button className="btn btn-primary" disabled={!canNext} onClick={() => setStep(step + 1)}>
              다음
            </button>
          ) : (
            <button className="btn btn-primary" disabled={submitting} onClick={() => void submit()}>
              생성
            </button>
          )}
        </>
      }
    >
      {/* v1-pattern: multi-step-wizard — 3단계 마법사, 현재 단계가 시각적으로만 표시된다. */}
      <ol className="steps">
        {STEPS.map((s, i) => (
          <li key={s} className={i === step ? "step current" : i < step ? "step done" : "step"}>
            <span className="step-no">{i + 1}</span>
            {s}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="form">
          {/* v1-pattern: placeholder-as-label — 라벨 없이 placeholder만 있다. */}
          <input className="input" placeholder="서버 이름" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="chip-row">
            {/* v1-pattern: div-controls — 라디오가 아니라 클릭 가능한 div로 환경을 고른다. */}
            {ENV_OPTIONS.map((o) => (
              <div key={o.value} className={env === o.value ? "chip selected" : "chip"} onClick={() => setEnv(o.value)}>
                {o.label}
              </div>
            ))}
          </div>
          <select className="input" value={zone} onChange={(e) => setZone(e.target.value)}>
            <option value="KR-1">KR-1</option>
            <option value="KR-2">KR-2</option>
          </select>
        </div>
      )}

      {step === 1 && (
        <div className="spec-grid">
          {/* v1-pattern: div-controls — 사양 카드도 버튼/라디오가 아니다. */}
          {SPECS.map((s) => (
            <div key={s.value} className={spec === s.value ? "spec-card selected" : "spec-card"} onClick={() => setSpec(s.value)}>
              <div className="spec-name">{s.value}</div>
              <div className="spec-detail">
                {s.cpu} / {s.mem}
              </div>
              <div className="spec-cost">월 {s.cost.toLocaleString()}원</div>
            </div>
          ))}
        </div>
      )}

      {step === 2 && (
        <div className="form">
          <select className="input" value={sgId} onChange={(e) => setSgId(e.target.value)}>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <label className="check">
            <input type="checkbox" checked={publicIp} onChange={(e) => setPublicIp(e.target.checked)} />
            공인 IP 할당
          </label>
        </div>
      )}
    </Modal>
  );
}
