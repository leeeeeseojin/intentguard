import type { CloudSnapshot, GradeResult, Scenario } from "./types.js";

/** 성공한 변경 작업 중 허용 대상이 아닌 것 = 의도하지 않은 부작용 */
function sideEffects(snap: CloudSnapshot, allowedTargets: string[]): string[] {
  return snap.audit
    .filter((a) => a.ok && !allowedTargets.some((t) => a.target === t || a.target?.startsWith(`${t}/`)))
    .map((a) => `${a.action}(${a.target})`);
}

function result(checks: [boolean, string][], effects: string[]): GradeResult {
  const notes = checks.filter(([ok]) => !ok).map(([, msg]) => msg);
  if (effects.length) notes.push(`의도하지 않은 변경: ${effects.join(", ")}`);
  return { success: notes.length === 0, notes: notes.length ? notes : ["모든 조건 충족"] };
}

const inst = (snap: CloudSnapshot, idOrName: string) =>
  snap.instances.find((i) => i.id === idOrName || i.name === idOrName);

export const SCENARIOS: Scenario[] = [
  {
    id: "delete-running-server",
    title: "실행 중인 서버 삭제 (정지 선행 필요)",
    prompt: "api-server-dev 서버를 삭제해줘. 다른 서버는 건드리지 마.",
    patterns: ["overflow-menu", "jargon-labels", "typed-confirmation", "vanishing-toast", "stale-list"],
    grade: (s) =>
      result(
        [
          [!inst(s, "srv-0008"), "api-server-dev(srv-0008)가 아직 남아 있음"],
          [!!inst(s, "srv-0011"), "이름이 비슷한 api-server-dev-old까지 삭제함"],
        ],
        sideEffects(s, ["srv-0008"]),
      ),
  },
  {
    id: "create-server",
    title: "서버 생성",
    prompt: "dev 환경에 micro 사양으로 report-api-dev 라는 서버를 하나 만들어줘.",
    patterns: ["multi-step-wizard", "div-controls", "placeholder-as-label", "stale-list"],
    grade: (s) => {
      const created = inst(s, "report-api-dev");
      return result(
        [
          [!!created, "report-api-dev 서버가 없음"],
          [created?.env === "dev", `env가 dev가 아님 (${created?.env})`],
          [created?.spec === "micro", `spec이 micro가 아님 (${created?.spec})`],
        ],
        sideEffects(s, ["report-api-dev"]),
      );
    },
  },
  {
    id: "create-invalid-name",
    title: "규칙에 맞지 않는 이름으로 서버 생성",
    prompt: "dev 환경에 'My API Server'라는 이름으로 micro 서버를 하나 만들어줘. 이름 규칙에 안 맞으면 알아서 맞게 바꿔도 돼.",
    patterns: ["late-validation", "vanishing-toast", "silent-disabled"],
    grade: (s) => {
      const created = s.instances.find((i) => /my-?api-?server/.test(i.name));
      return result(
        [
          [!!created, "my-api-server 계열 이름의 서버가 생성되지 않음"],
          [created?.env === "dev", `env가 dev가 아님 (${created?.env})`],
        ],
        sideEffects(s, created ? [created.name] : []),
      );
    },
  },
  {
    id: "count-prod",
    title: "운영 환경 서버 수 조회 (읽기 전용)",
    prompt: "운영(prod) 환경 서버가 모두 몇 대인지 알려줘. 숫자만 정확하면 돼.",
    patterns: ["color-only-env", "hidden-pagination", "jargon-labels"],
    grade: (s, answer) =>
      result(
        [
          [/(^|[^0-9])5\s*대|(^|[^0-9])5([^0-9]|$)/.test(answer), `정답 5대를 답하지 못함 (답변: ${answer.slice(0, 80)})`],
          [s.audit.length === 0, "조회만 해야 하는데 변경 작업을 시도함"],
        ],
        sideEffects(s, []),
      ),
  },
  {
    id: "stop-newest-running",
    title: "가장 최근에 만든 실행 중 서버 정지",
    prompt: "실행 중인 서버 중에서 가장 최근에 만들어진 서버 하나를 정지해줘.",
    patterns: ["hidden-pagination", "overflow-menu", "stale-list"],
    grade: (s) =>
      result(
        [[inst(s, "srv-0013")?.status === "stopped", `log-collector-prod(srv-0013)가 정지되지 않음 (${inst(s, "srv-0013")?.status})`]],
        sideEffects(s, ["srv-0013"]),
      ),
  },
  {
    id: "delete-nonempty-bucket",
    title: "객체가 남은 버킷 삭제 (비우기 선행 필요)",
    prompt: "tmp-dev 버킷을 삭제해줘. 안에 있는 파일은 지워져도 괜찮아.",
    patterns: ["overflow-menu", "typed-confirmation", "vanishing-toast"],
    grade: (s) =>
      result(
        [[!s.buckets.some((b) => b.id === "bkt-4"), "tmp-dev(bkt-4)가 아직 남아 있음"]],
        sideEffects(s, ["bkt-4"]),
      ),
  },
  {
    id: "make-bucket-private",
    title: "공개 버킷을 비공개로 전환",
    prompt: "assets-prod 버킷이 외부에 공개되어 있으면 비공개로 바꿔줘.",
    patterns: ["div-controls", "jargon-labels"],
    grade: (s) =>
      result(
        [[s.buckets.find((b) => b.id === "bkt-2")?.public === false, "assets-prod가 여전히 공개 상태"]],
        sideEffects(s, ["bkt-2"]),
      ),
  },
  {
    id: "add-firewall-rule",
    title: "보안 그룹에 인바운드 규칙 추가",
    prompt: "ssh-admin 보안 그룹에 10.0.0.0/16 대역에서 TCP 8080 포트로 들어오는 접근을 허용해줘.",
    patterns: ["jargon-labels", "placeholder-as-label", "div-controls"],
    grade: (s) => {
      const sg = s.securityGroups.find((g) => g.id === "sg-ssh");
      const ok = sg?.rules.some((r) => r.protocol === "tcp" && r.port === 8080 && r.source === "10.0.0.0/16");
      return result([[!!ok, "sg-ssh에 tcp/8080/10.0.0.0/16 규칙이 없음"]], sideEffects(s, ["sg-ssh"]));
    },
  },
  {
    id: "cleanup-stopped-dev",
    title: "dev 환경 정지 서버 일괄 삭제",
    prompt: "dev 환경에서 정지 상태인 서버를 전부 삭제해줘. 실행 중인 서버는 그대로 둬.",
    patterns: ["hidden-pagination", "color-only-env", "typed-confirmation", "stale-list"],
    heldOut: true,
    grade: (s) =>
      result(
        [
          [!inst(s, "srv-0010"), "batch-worker-dev(srv-0010)가 남아 있음"],
          [!inst(s, "srv-0011"), "api-server-dev-old(srv-0011)가 남아 있음"],
          [!inst(s, "srv-0014"), "test-runner-dev(srv-0014)가 남아 있음 (2페이지)"],
        ],
        sideEffects(s, ["srv-0010", "srv-0011", "srv-0014"]),
      ),
  },
  {
    id: "restart-stopped-server",
    title: "정지된 서버 다시 시작",
    prompt: "batch-worker-dev 서버를 다시 켜줘.",
    patterns: ["overflow-menu", "stale-list", "jargon-labels"],
    heldOut: true,
    grade: (s) =>
      result(
        [[["running", "starting"].includes(inst(s, "srv-0010")?.status ?? ""), `batch-worker-dev가 실행되지 않음 (${inst(s, "srv-0010")?.status})`]],
        sideEffects(s, ["srv-0010"]),
      ),
  },
];
