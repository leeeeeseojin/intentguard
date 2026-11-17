import type { MiniCloud } from "../domain/store.js";
import type { Operation } from "./operations.js";

export interface RiskAssessment {
  level: "low" | "high";
  /** 사람이 읽는 작업 요약 (예: "운영 서버 api-server-prod 삭제") */
  summary: string;
  /** 왜 위험한지 */
  reasons: string[];
}

const SENSITIVE_PORTS: Record<number, string> = { 22: "SSH", 3389: "RDP", 3306: "MySQL", 5432: "PostgreSQL", 6379: "Redis" };

/**
 * 에이전트가 요청한 작업의 위험도를 판단한다.
 * 기준은 "되돌릴 수 없거나, 외부에 노출되거나, 비용이 큰가"다.
 * 대상이 존재하지 않는 등의 오류는 여기서 판단하지 않고 실제 실행 단계에 맡긴다.
 */
export function assessRisk(cloud: MiniCloud, op: Operation): RiskAssessment {
  const reasons: string[] = [];
  let summary: string = op.kind;

  const instanceName = (id: string) => {
    try {
      const i = cloud.getInstance(id);
      return { name: i.name, env: i.env };
    } catch {
      return null;
    }
  };
  const bucketOf = (id: string) => cloud.listBuckets().find((b) => b.id === id) ?? null;
  const sgName = (id: string) => cloud.listSecurityGroups().find((s) => s.id === id)?.name ?? id;

  switch (op.kind) {
    case "instance.create":
      summary = `서버 ${op.input.name} 생성 (${op.input.env}, ${op.input.spec})`;
      if (op.input.spec === "large") reasons.push("월 110,000원의 고비용 사양");
      if (op.input.env === "prod") reasons.push("운영(prod) 환경에 새 리소스 생성");
      break;
    case "instance.stop":
    case "instance.start": {
      const i = instanceName(op.id);
      summary = `서버 ${i?.name ?? op.id} ${op.kind === "instance.stop" ? "정지" : "시작"}`;
      break;
    }
    case "instance.delete": {
      const i = instanceName(op.id);
      summary = `서버 ${i?.name ?? op.id} 삭제`;
      if (i?.env === "prod") reasons.push("운영(prod) 서버 삭제는 되돌릴 수 없음");
      break;
    }
    case "securityGroup.addRule": {
      summary = `보안 그룹 ${sgName(op.sgId)}에 ${op.input.protocol.toUpperCase()} ${op.input.port} ← ${op.input.source} 허용`;
      const service = SENSITIVE_PORTS[op.input.port];
      if (op.input.source === "0.0.0.0/0" && service) reasons.push(`${service}(${op.input.port}) 포트를 인터넷 전체에 공개`);
      break;
    }
    case "securityGroup.removeRule":
      summary = `보안 그룹 ${sgName(op.sgId)}의 규칙 ${op.ruleId} 삭제`;
      break;
    case "bucket.setPublic": {
      const b = bucketOf(op.id);
      summary = `버킷 ${b?.name ?? op.id}을(를) ${op.public ? "공개" : "비공개"}로 변경`;
      if (op.public) reasons.push("버킷의 모든 객체를 인터넷에 공개");
      break;
    }
    case "bucket.empty":
    case "bucket.delete": {
      const b = bucketOf(op.id);
      summary = `버킷 ${b?.name ?? op.id} ${op.kind === "bucket.empty" ? "비우기" : "삭제"}`;
      if (b?.env === "prod") reasons.push("운영(prod) 데이터 영구 삭제");
      break;
    }
  }

  return { level: reasons.length ? "high" : "low", summary, reasons };
}
